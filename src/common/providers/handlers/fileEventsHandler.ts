import { container } from "tsyringe";
import {
  Connection,
  CreateFilesParams,
  DeleteFilesParams,
  FileCreate,
  FileDelete,
  FileRename,
  RenameFilesParams,
  WorkspaceEdit,
} from "vscode-languageserver";
import { TextEdit } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { IProgram } from "../../../compiler/program.js";
import { PositionUtil } from "../../positionUtil.js";
import { getModuleName } from "../../../compiler/utils/elmUtils.js";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher.js";
import { RefactorEditUtils } from "../../util/refactorEditUtils.js";
import { RenameUtils } from "../../util/renameUtils.js";
import { TreeUtils } from "../../util/treeUtils.js";
import { ASTProvider } from "../astProvider.js";
import {
  ICreateFileParams,
  IDeleteFileParams,
  IRenameFileParams,
} from "../paramsExtensions.js";
import { RenameProvider } from "../renameProvider.js";
import { IFileSystemHost } from "../../types.js";
import { TextDocumentEvents } from "../../util/textDocumentEvents.js";

export class FileEventsHandler {
  private connection: Connection;
  private astProvider: ASTProvider;

  constructor(
    private host: IFileSystemHost,
    didCreateFile?: (uri: string) => void,
  ) {
    this.connection = container.resolve<Connection>("Connection");
    this.astProvider = container.resolve(ASTProvider);

    const onDidCreateFile = async (
      params: CreateFilesParams,
    ): Promise<void> => {
      const edit: WorkspaceEdit = { changes: {} };
      for (const { uri } of params.files) {
        const changes = await new ElmWorkspaceMatcher(({ uri }: FileCreate) =>
          URI.parse(uri),
        ).handle(this.onDidCreateFile.bind(this))({
          uri,
        });

        if (changes && edit.changes) {
          edit.changes[uri] = changes;
        }
      }

      await this.connection.workspace.applyEdit(edit);

      // Used for testing
      if (didCreateFile) {
        for (const { uri } of params.files) {
          didCreateFile(uri);
        }
      }
    };

    this.connection.workspace.onDidCreateFiles((params: CreateFilesParams) => {
      void onDidCreateFile(params);
    });

    this.connection.workspace.onWillRenameFiles(
      async (params: RenameFilesParams) => {
        const edit: WorkspaceEdit = { changes: {} };
        for (const { oldUri, newUri } of params.files) {
          const workspaceEdit = await new ElmWorkspaceMatcher(
            ({ oldUri }: FileRename) => URI.parse(oldUri),
          ).handle(this.onWillRenameFile.bind(this))({
            oldUri,
            newUri,
          });

          if (workspaceEdit) {
            this.mergeWorkspaceEdit(edit, workspaceEdit);
          }
        }
        return edit;
      },
    );

    this.connection.workspace.onWillDeleteFiles(
      async (params: DeleteFilesParams) => {
        for (const { uri } of params.files) {
          await new ElmWorkspaceMatcher(({ uri }: FileDelete) =>
            URI.parse(uri),
          ).handle(this.onWillDeleteFile.bind(this))({
            uri,
          });
        }

        return null;
      },
    );
  }

  private async onDidCreateFile({
    uri,
    program,
  }: ICreateFileParams): Promise<TextEdit[] | undefined> {
    const moduleName = this.getModuleNameFromFile(uri, program);

    if (moduleName) {
      // A create notification also covers copied files, which may not have
      // reached the file watcher yet. Only scaffold a known-empty document.
      let text = container.resolve(TextDocumentEvents).get(uri)?.getText();
      if (text === undefined) {
        try {
          text = await this.host.readFile(URI.parse(uri));
        } catch {
          return;
        }
        // Prefer an editor buffer opened or changed while the read was pending.
        text =
          container.resolve(TextDocumentEvents).get(uri)?.getText() ?? text;
      }
      if (text !== "") {
        return;
      }

      const addModuleDefinitionEdit =
        RefactorEditUtils.addModuleDeclaration(moduleName);
      return [addModuleDefinitionEdit];
    }
  }

  private onWillRenameFile({
    oldUri,
    newUri,
    program,
    sourceFile,
  }: IRenameFileParams): WorkspaceEdit | undefined {
    // Handle folder rename
    if (!sourceFile) {
      return Array.from(program.getSourceFiles().values())
        .filter(({ uri }) => uri.startsWith(`${oldUri}/`))
        .map((sourceFile) =>
          this.onWillRenameFile({
            oldUri: sourceFile.uri,
            newUri: sourceFile.uri.replace(oldUri, newUri),
            program,
            sourceFile,
          }),
        )
        .reduce<WorkspaceEdit>(
          (prev, cur) => (cur ? this.mergeWorkspaceEdit(prev, cur) : prev),
          {},
        );
    }

    const newModuleName = this.getModuleNameFromFile(newUri, program);
    const moduleNameNode = TreeUtils.getModuleNameNode(sourceFile.tree);

    if (newModuleName && moduleNameNode) {
      const moduleNodePosition = PositionUtil.FROM_TS_POSITION(
        moduleNameNode.endPosition,
      ).toVSPosition();

      const affectedNodes = RenameUtils.getRenameAffectedNodes(
        program,
        oldUri,
        moduleNodePosition,
      );

      const [edits] = RenameProvider.getRenameEdits(
        affectedNodes,
        newModuleName,
      );

      if (sourceFile.moduleName) {
        if (!sourceFile.isTestFile) {
          if (
            sourceFile.project.moduleToUriMap.get(sourceFile.moduleName) ===
            oldUri
          ) {
            sourceFile.project.moduleToUriMap.delete(sourceFile.moduleName);
          }
          sourceFile.project.moduleToUriMap.set(newModuleName, newUri);
        }

        if (
          sourceFile.project.testModuleToUriMap.get(sourceFile.moduleName) ===
          oldUri
        ) {
          sourceFile.project.testModuleToUriMap.delete(sourceFile.moduleName);
        }
        sourceFile.project.testModuleToUriMap.set(newModuleName, newUri);
      }

      this.astProvider.addPendingRename(oldUri, newUri);

      return {
        changes: edits,
      };
    }
  }

  private onWillDeleteFile({ uri, program }: IDeleteFileParams): void {
    program.getForest().removeTree(uri);
    program.markAsDirty();
  }

  private getModuleNameFromFile(
    uri: string,
    program: IProgram,
  ): string | undefined {
    const sourceDir = program.getSourceDirectoryOfFile(uri);

    // The file is not in a source dir (shouldn't happen)
    if (!sourceDir) {
      return;
    }

    const filePath = URI.parse(uri).path;
    if (!filePath.endsWith(".elm")) {
      return;
    }

    const moduleName = getModuleName(filePath, URI.parse(sourceDir).path);
    if (/^\p{Lu}[\p{L}\d_]*(?:\.\p{Lu}[\p{L}\d_]*)*$/u.test(moduleName)) {
      return moduleName;
    }
  }

  private mergeWorkspaceEdit(
    a: WorkspaceEdit,
    b: WorkspaceEdit,
  ): WorkspaceEdit {
    // Merge changes
    if (b.changes) {
      Object.entries(b.changes).forEach(([uri, edits]) => {
        if (!a.changes) {
          a.changes = {};
        }

        if (a.changes[uri]) {
          a.changes[uri].push(...edits);
        } else {
          a.changes[uri] = edits;
        }
      });
    }

    if (b.documentChanges) {
      if (!a.documentChanges) {
        a.documentChanges = [];
      }
      a.documentChanges.push(...b.documentChanges);
    }

    return a;
  }
}
