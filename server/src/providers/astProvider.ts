const glob = require("glob");
const fs = require("fs");
const util = require("util");

// Convert fs.readFile into Promise version of same
const readFile = util.promisify(fs.readFile);
const globPromise = util.promisify(glob);

import Parser, { Point, SyntaxNode, Tree } from "tree-sitter";
import TreeSitterElm from "tree-sitter-elm";
import {
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  IConnection,
  TextDocumentIdentifier,
  VersionedTextDocumentIdentifier,
} from "vscode-languageserver";
import URI from "vscode-uri";
import { IForest } from "../forest";
import { Position } from "../position";

export class ASTProvider {
  private connection: IConnection;
  private forest: IForest;
  private parser: Parser;
  private elmWorkspace: URI;

  constructor(connection: IConnection, forest: IForest, elmWorkspace: URI) {
    this.connection = connection;
    this.forest = forest;
    this.elmWorkspace = elmWorkspace;
    this.parser = new Parser();
    try {
      this.parser.setLanguage(TreeSitterElm);
    } catch (error) {
      this.connection.console.info(error.toString());
    }

    this.connection.onDidChangeTextDocument(this.handleChangeTextDocument);
    this.connection.onDidCloseTextDocument(this.handleCloseTextDocument);

    this.initializeWorkspace();
  }

  protected initializeWorkspace = async (): Promise<void> => {
    try {
      const path = this.elmWorkspace.toString(true) + "elm.json";
      this.connection.console.info("Reading elm.json from " + path); // output 'testing'
      // Find elm files and feed them to tree sitter
      const elmJson = require(path);
      const sourceDirs = elmJson["source-directories"];
      const elmFolders: string[] = [];
      sourceDirs.forEach(async (folder: string) => {
        elmFolders.push(this.elmWorkspace.toString(true) + folder);
      });
      this.connection.console.info(elmFolders.toString()); // output 'testing'
      const elmFilePaths = await this.findElmFilesInFolders(elmFolders);
      this.connection.console.info(
        "Found " +
          elmFilePaths.length.toString() +
          " files to add to the project",
      );

      for (const filePath of elmFilePaths) {
        const fileContent: string = await readFile(filePath.toString(), "utf8");
        let tree: Tree | undefined;
        tree = this.parser.parse(fileContent);
        this.forest.setTree(URI.file(filePath).toString(), true, true, tree);
      }
    } catch (error) {
      this.connection.console.info(error.toString());
    }
  };

  protected handleChangeTextDocument = async (
    params: DidChangeTextDocumentParams,
  ): Promise<void> => {
    this.connection.console.info("Changed text document, going to parse it");
    const document: VersionedTextDocumentIdentifier = params.textDocument;
    let tree: Tree | undefined = this.forest.getTree(document.uri);
    if (tree === undefined) return;

    for (const changeEvent of params.contentChanges) {
      if (changeEvent.range && changeEvent.rangeLength) {
        // range is range of the change. end is exclusive
        // rangeLength is length of text removed
        // text is new text
        const { range, rangeLength, text } = changeEvent;
        const startIndex: number = range.start.line * range.start.character;
        const oldEndIndex: number = startIndex + rangeLength - 1;
        if (tree) {
          tree.edit({
            // end index for new version of text
            newEndIndex: range.end.line * range.end.character - 1,
            // position in new doc change ended
            newEndPosition: Position.FROM_VS_POSITION(range.end).toTSPosition(),

            // end index for old version of text
            oldEndIndex,
            // position in old doc change ended.
            oldEndPosition: this.computeEndPosition(
              startIndex,
              oldEndIndex,
              tree,
            ),

            // index in old doc the change started
            startIndex,
            // position in old doc change started
            startPosition: Position.FROM_VS_POSITION(
              range.start,
            ).toTSPosition(),
          });
        }
        tree = this.parser.parse(text, tree);
      } else {
        tree = this.buildTree(changeEvent.text);
      }
    }
    if (tree) this.forest.setTree(document.uri, true, true, tree);
  };

  protected handleCloseTextDocument = async (
    params: DidCloseTextDocumentParams,
  ): Promise<void> => {
    const document: TextDocumentIdentifier = params.textDocument;
    this.forest.removeTree(document.uri);
  };

  private async findElmFilesInFolders(elmFolders: string[]): Promise<string[]> {
    let elmFilePaths: string[] = [];
    for (const element of elmFolders) {
      elmFilePaths = elmFilePaths.concat(
        await this.findElmFilesInFolder(element),
      );
    }
    return elmFilePaths;
  }

  private async findElmFilesInFolder(path: string): Promise<string[]> {
    return await globPromise(path + "/**/*.elm", {});
  }

  private buildTree = (text: string): Tree | undefined => {
    return this.parser.parse(text);
  };

  private computeEndPosition = (
    startIndex: number,
    endIndex: number,
    tree: Tree,
  ): Point => {
    const node: SyntaxNode = tree.rootNode.descendantForIndex(
      startIndex,
      endIndex,
    );

    return node.endPosition;
  };
}
