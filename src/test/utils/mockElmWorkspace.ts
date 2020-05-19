import * as Path from "path";
import { URI } from "vscode-uri";
import Parser from "web-tree-sitter";
import { IElmWorkspace } from "../../elmWorkspace";
import { Forest } from "../../forest";
import { Imports } from "../../imports";

export const mockUri = Path.join(__dirname, "../sources/src/Test.elm");

export class MockElmWorkspace implements IElmWorkspace {
  private imports: Imports;
  private forest: Forest = new Forest();

  constructor(source: string, parser: Parser) {
    const tree = parser.parse(source);

    this.forest.setTree(mockUri, true, true, tree);
    this.imports = new Imports(parser);
    this.imports.updateImports(mockUri, tree, this.forest);
  }

  init(progressCallback: (percent: number) => void): void {
    return;
  }

  hasDocument(uri: URI): boolean {
    return false;
  }

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
}
