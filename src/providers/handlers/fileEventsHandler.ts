import { relative } from "path";
import { IElmWorkspace } from "../../elmWorkspace";
import {
  OnDidCreateFilesRequest,
  OnDidRenameFilesRequest,
} from "../../protocol";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { RefactorEditUtils } from "../../util/refactorEditUtils";
import { container } from "tsyringe";
import { IConnection } from "vscode-languageserver";
import { URI } from "vscode-uri";

export class FileEventsHandler {
  private connection: IConnection;

  constructor() {
    this.connection = container.resolve<IConnection>("Connection");

    this.connection.onRequest(OnDidCreateFilesRequest, async (params) => {
      for (const file of params.files) {
        await new ElmWorkspaceMatcher((file: URI) => file).handlerForWorkspace(
          this.onDidCreateFile.bind(this),
        )(URI.revive(file));
      }
    });

    this.connection.onRequest(OnDidRenameFilesRequest, async (params) => {
      for (const { oldUri, newUri } of params.files) {
        await new ElmWorkspaceMatcher((file: URI) => file).handlerForWorkspace(
          this.onDidRenameFile.bind(this, URI.revive(oldUri)),
        )(URI.revive(newUri));
      }
    });
  }

  async onDidCreateFile(file: URI, elmWorkspace: IElmWorkspace): Promise<void> {
    if (!file.toString().endsWith(".elm")) {
      return;
    }

    const moduleName = this.getModuleNameFromFile(file, elmWorkspace);

    if (moduleName) {
      const addModuleDefinitionEdit = RefactorEditUtils.addModuleDeclaration(
        moduleName,
      );
      await this.connection.workspace.applyEdit({
        changes: { [file.toString()]: [addModuleDefinitionEdit] },
      });
    }
  }

  async onDidRenameFile(
    oldFile: URI,
    newFile: URI,
    elmWorkspace: IElmWorkspace,
  ): Promise<void> {
    if (!newFile.toString().endsWith(".elm")) {
      return;
    }

    const moduleName = this.getModuleNameFromFile(newFile, elmWorkspace);

    const tree = elmWorkspace.getForest().getByUri(oldFile.toString())?.tree;
    if (moduleName && tree) {
      const renameModuleDefinitionEdit = RefactorEditUtils.renameModuleDeclaration(
        tree,
        moduleName,
      );

      if (renameModuleDefinitionEdit) {
        await this.connection.workspace.applyEdit({
          changes: { [newFile.toString()]: [renameModuleDefinitionEdit] },
        });
      }
    }
  }

  getModuleNameFromFile(
    file: URI,
    elmWorkspace: IElmWorkspace,
  ): string | undefined {
    const sourceDir = elmWorkspace.getPath(file);

    // The file is not in a source dir (shouldn't happen)
    if (!sourceDir) {
      return;
    }

    const relativePath = URI.file(relative(sourceDir, file.fsPath)).path.slice(
      1,
    );

    // Remove extension and convert to module name
    return relativePath.split(".").slice(0, -1).join(".").split("/").join(".");
  }
}
