import { container } from "tsyringe";
import {
  IConnection,
  Position,
  PrepareRenameParams,
  Range,
  RenameFile,
  RenameParams,
  ResponseError,
  TextDocumentEdit,
  TextEdit,
  VersionedTextDocumentIdentifier,
  WorkspaceEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { IElmWorkspace } from "../elmWorkspace";
import { Forest } from "../forest";
import { IImports } from "../imports";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { References } from "../util/references";
import { TreeUtils } from "../util/treeUtils";

export class RenameProvider {
  private connection: IConnection;

  constructor() {
    this.connection = container.resolve<IConnection>("Connection");
    this.connection.onPrepareRename(
      new ElmWorkspaceMatcher((params: PrepareRenameParams) =>
        URI.parse(params.textDocument.uri),
      ).handlerForWorkspace(this.handlePrepareRenameRequest),
    );

    this.connection.onRenameRequest(
      new ElmWorkspaceMatcher((params: RenameParams) =>
        URI.parse(params.textDocument.uri),
      ).handlerForWorkspace(this.handleRenameRequest),
    );
  }

  protected handleRenameRequest = (
    params: RenameParams,
    elmWorkspace: IElmWorkspace,
  ): WorkspaceEdit | null | undefined => {
    this.connection.console.info(`Renaming was requested`);

    let newName = params.newName;

    const affectedNodes = this.getRenameAffectedNodes(
      elmWorkspace,
      params.textDocument.uri,
      params.position,
    );

    const renameChanges: RenameFile[] = [];
    if (
      affectedNodes?.originalNode.parent?.parent?.type === "module_declaration"
    ) {
      const fullModuleName = affectedNodes?.originalNode.parent.text;
      const modulePrefix = fullModuleName.substring(
        0,
        fullModuleName.lastIndexOf("."),
      );

      newName =
        modulePrefix.length > 0
          ? `${modulePrefix}.${params.newName}`
          : params.newName;

      const newUri = this.generateUriFromModuleName(
        newName,
        elmWorkspace,
        URI.parse(params.textDocument.uri),
      );

      if (newUri) {
        renameChanges.push({
          kind: "rename",
          oldUri: params.textDocument.uri,
          newUri: newUri.toString(),
        } as RenameFile);
      }
    }

    const map: { [uri: string]: TextEdit[] } = {};
    affectedNodes?.references.forEach((a) => {
      if (!map[a.uri]) {
        map[a.uri] = [];
      }

      map[a.uri].push(
        TextEdit.replace(
          Range.create(
            Position.create(
              a.node.startPosition.row,
              a.node.startPosition.column,
            ),
            Position.create(a.node.endPosition.row, a.node.endPosition.column),
          ),
          newName,
        ),
      );
    });

    const textDocumentEdits = [];
    for (const key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        const element = map[key];
        textDocumentEdits.push(
          TextDocumentEdit.create(
            VersionedTextDocumentIdentifier.create(key, null),
            element,
          ),
        );
      }
    }

    if (map) {
      return {
        changes: map, // Fallback if the client doesn't implement documentChanges
        documentChanges: [...textDocumentEdits, ...renameChanges], //Order seems to be important here
      };
    }
  };

  protected handlePrepareRenameRequest = (
    params: PrepareRenameParams,
    elmWorkspace: IElmWorkspace,
  ): Range | null => {
    this.connection.console.info(`Prepare rename was requested`);

    const affectedNodes = this.getRenameAffectedNodes(
      elmWorkspace,
      params.textDocument.uri,
      params.position,
    );

    if (affectedNodes?.references.length) {
      const node = affectedNodes.originalNode;
      return Range.create(
        Position.create(node.startPosition.row, node.startPosition.column),
        Position.create(node.endPosition.row, node.endPosition.column),
      );
    }

    return null;
  };

  private generateUriFromModuleName(
    moduleName: string,
    elmWorkspace: IElmWorkspace,
    file: URI,
  ): URI | undefined {
    const sourceDir = elmWorkspace.getPath(file);

    // The file is not in a source dir (shouldn't happen)
    if (!sourceDir) {
      return;
    }

    const newUri = `${sourceDir}/${moduleName.replace(".", "/")}.elm`;

    return URI.parse(newUri);
  }

  private getRenameAffectedNodes(
    elmWorkspace: IElmWorkspace,
    uri: string,
    position: Position,
  ):
    | {
        originalNode: SyntaxNode;
        references: {
          node: SyntaxNode;
          uri: string;
        }[];
      }
    | undefined {
    const imports: IImports = elmWorkspace.getImports();
    const forest: Forest = elmWorkspace.getForest();
    const tree: Tree | undefined = forest.getTree(uri);

    if (tree) {
      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        tree.rootNode,
        position,
      );

      const definitionNode = TreeUtils.findDefinitionNodeByReferencingNode(
        nodeAtPosition,
        uri,
        tree,
        imports,
      );

      if (definitionNode) {
        const refTree = forest.getByUri(definitionNode.uri);
        if (refTree && refTree.writeable) {
          return {
            originalNode: nodeAtPosition,
            references: References.find(definitionNode, forest, imports),
          };
        }
        if (refTree && !refTree.writeable) {
          throw new ResponseError(
            1,
            "Can not rename, due to source being outside of you project.",
          );
        }
      }
    }
  }
}
