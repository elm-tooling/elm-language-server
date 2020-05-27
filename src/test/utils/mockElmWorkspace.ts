import * as Path from "path";
import { URI } from "vscode-uri";
import Parser, { Tree } from "web-tree-sitter";
import { IElmWorkspace } from "../../elmWorkspace";
import { Forest } from "../../forest";
import { Imports } from "../../imports";
import { readFileSync } from "fs";

export const mockUri = Path.join(__dirname, "../sources/src/Test.elm");
export const mockUri2 = Path.join(__dirname, "../sources/src/Test2.elm");

export class MockElmWorkspace implements IElmWorkspace {
  private imports: Imports;
  private forest: Forest = new Forest();
  private parser: Parser;

  constructor(source: string, parser: Parser) {
    this.parser = parser;

    const tree = this.parser.parse(source);
    this.forest.setTree(mockUri, true, true, tree, true);

    this.imports = new Imports(parser);

    this.readAndAddToForest(mockUri2);
    this.imports.updateImports(mockUri, tree, this.forest);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(progressCallback: (percent: number) => void): void {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hasDocument(uri: URI): boolean {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hasPath(uri: URI): boolean {
    return false;
  }

  getForest(): Forest {
    return this.forest;
  }

  getImports(): Imports {
    return this.imports;
  }

  getRootPath(): URI {
    return URI.file(Path.join(__dirname, "sources"));
  }

  private readAndAddToForest(uri: string): void {
    const fileContent = readFileSync(uri, {
      encoding: "utf-8",
    });

    const tree: Tree | undefined = this.parser.parse(fileContent);
    this.forest.setTree(URI.file(uri).toString(), true, true, tree, true);
    this.imports.updateImports(uri, tree, this.forest);
  }
}
