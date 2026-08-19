import { container } from "tsyringe";
import {
  DidChangeTextDocumentParams,
  DidOpenTextDocumentParams,
  Event,
  Emitter,
  Connection,
  FileChangeType,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { Node as SyntaxNode, Parser } from "web-tree-sitter";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher.js";
import { TextDocumentEvents } from "../util/textDocumentEvents.js";
import { TreeUtils } from "../util/treeUtils.js";
import { ISourceFile } from "../../compiler/forest.js";
import { FileChangeParams, IFileChangeParams } from "./paramsExtensions.js";
import { IFileSystemHost } from "../types.js";
import { applyChangesToTree, parseOrThrow } from "../util/treeSitter.js";

export class ASTProvider {
  private connection: Connection;
  private parser: Parser;
  private documentEvents: TextDocumentEvents;

  private treeChangeEvent = new Emitter<{
    sourceFile: ISourceFile;
    declaration?: SyntaxNode;
  }>();
  readonly onTreeChange: Event<{
    sourceFile: ISourceFile;
    declaration?: SyntaxNode;
  }> = this.treeChangeEvent.event;

  private treeDeleteEvent = new Emitter<{ uri: string }>();
  readonly onTreeDelete: Event<{ uri: string }> = this.treeDeleteEvent.event;

  private pendingRenames = new Map<string, string>();

  constructor(private host: IFileSystemHost) {
    this.parser = container.resolve("Parser");
    this.connection = container.resolve("Connection");
    this.documentEvents = container.resolve(TextDocumentEvents);

    const handleChange = new ElmWorkspaceMatcher((params: FileChangeParams) =>
      URI.parse(params.uri),
    ).handle(this.handleChangeTextDocument.bind(this));

    this.documentEvents.onDidChange((params: DidChangeTextDocumentParams) => {
      void handleChange({
        uri: params.textDocument.uri,
        contentChanges: params.contentChanges,
      });
    });

    this.documentEvents.onDidOpen((params: DidOpenTextDocumentParams) => {
      void handleChange({
        uri: params.textDocument.uri,
      });
    });

    this.connection.onDidChangeWatchedFiles((params) => {
      params.changes.forEach((change) => {
        if (
          change.type === FileChangeType.Changed ||
          change.type === FileChangeType.Created
        ) {
          void handleChange(change);
        }

        if (change.type === FileChangeType.Deleted) {
          void new ElmWorkspaceMatcher((params: { uri: string }) =>
            URI.parse(params.uri),
          ).handle((params) => {
            const forest = params.program.getForest(false);
            forest.removeTree(params.uri);
            params.program.markAsDirty();
            this.treeDeleteEvent.fire({ uri: params.uri });
          })(change);
        }
      });
    });
  }

  public addPendingRename(oldUri: string, newUri: string): void {
    this.pendingRenames.set(oldUri, newUri);
  }

  protected handleChangeTextDocument = async (
    params: IFileChangeParams,
  ): Promise<void> => {
    this.connection.console.info(
      `Changed text document, going to parse it. ${params.uri}`,
    );
    const forest = params.program.getForest(false); // Don't synchronize the forest, we are only looking at the tree

    // Source file could be undefined here
    const sourceFile = <ISourceFile | undefined>params.sourceFile;

    const newText = await this.getText(params.uri);

    if (newText === undefined) {
      return;
    }

    if (
      sourceFile &&
      (sourceFile.tree.rootNode.text === newText || !sourceFile.writeable)
    ) {
      return;
    }

    let tree = sourceFile?.tree;

    let hasContentChanges = false;
    if ("contentChanges" in params && params.contentChanges) {
      hasContentChanges = true;

      if (tree) {
        applyChangesToTree(tree, params.contentChanges);
      }
    }

    const pendingRenameUri = this.pendingRenames.get(params.uri);
    this.pendingRenames.delete(params.uri);

    // Remove the old tree
    if (pendingRenameUri) {
      forest.removeTree(params.uri);
    }

    const oldNodes = tree?.rootNode.namedChildren ?? [];

    const newTree = parseOrThrow(
      this.parser,
      newText,
      hasContentChanges ? tree : undefined,
    );

    let changedDeclaration: SyntaxNode | undefined;

    tree
      ?.getChangedRanges(newTree)
      .map((range) => [
        tree?.rootNode.descendantForPosition(range.startPosition),
        tree?.rootNode.descendantForPosition(range.endPosition),
      ])
      .map(([startNode, endNode]) => [
        startNode
          ? TreeUtils.findParentOfType("value_declaration", startNode, true)
          : undefined,
        endNode
          ? TreeUtils.findParentOfType("value_declaration", endNode, true)
          : undefined,
      ])
      .forEach(([startNode, endNode]) => {
        if (
          startNode &&
          endNode &&
          startNode.id === endNode.id &&
          TreeUtils.getTypeAnnotation(startNode)
        ) {
          changedDeclaration = startNode;
          params.program.getTypeCache().invalidateValueDeclaration(startNode);
        }
      });

    if (!changedDeclaration) {
      params.program.getTypeCache().invalidateProject();
    }

    tree = newTree;

    const newIds = new Set(
      newTree.rootNode.namedChildren.map((n) => n.id).values(),
    );

    oldNodes.forEach((node) => {
      if (node && !newIds.has(node.id)) {
        params.program.getTypeCache().invalidateValueDeclaration(node);
        params.program.getTypeCache().invalidateTypeAnnotation(node);
        params.program.getTypeCache().invalidateTypeOrTypeAlias(node);
      }
    });

    if (tree) {
      // Reuse old source file for most cases
      const isTestFile = params.sourceFile
        ? params.sourceFile.isTestFile
        : (params.program
            .getSourceDirectoryOfFile(params.uri)
            ?.endsWith("tests") ?? false);

      const isDependency = params.sourceFile
        ? params.sourceFile.isDependency
        : false;

      const sourceFile = forest.setSourceFile(
        pendingRenameUri ?? params.uri,
        true,
        tree,
        isTestFile,
        isDependency,
        params.sourceFile?.project,
        params.sourceFile?.maintainerAndPackageName,
      );

      // The program now needs to be synchronized
      params.program.markAsDirty();

      setImmediate(() => {
        if (tree) {
          this.treeChangeEvent.fire({
            sourceFile,
            declaration: changedDeclaration,
          });
        }
      });
    }
  };

  private async getText(uri: string): Promise<string | undefined> {
    const documentText = this.documentEvents.get(uri)?.getText();

    if (documentText !== undefined) {
      return documentText;
    }

    try {
      return await this.host.readFile(URI.parse(uri));
    } catch {
      this.connection.console.warn(`Unable to read changed file ${uri}`);
    }
  }
}
