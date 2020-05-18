import * as Path from "path";
import { URI } from "vscode-uri";
import Parser from "web-tree-sitter";
import { IElmWorkspace } from "../elmWorkspace";
import { Forest } from "../forest";
import { Imports } from "../imports";

export const mockUri = Path.join(__dirname, "sources/src/Test.elm");

class MockElmWorkspace implements IElmWorkspace {
  private imports: Imports;
  private forest: Forest = new Forest();

  constructor(source: string, parser: Parser) {
    const tree = parser.parse(source);

    this.forest.setTree(mockUri, true, true, tree);
    this.imports = new Imports(parser);
    this.imports.updateImports(mockUri, tree, this.forest);
  }

  init(progressCallback: (percent: number) => void): void {}

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

export class SourceTreeParser {
  private parser: Parser | undefined;

  constructor() {}

  public async init() {
    if (this.parser) {
      return;
    }

    await Parser.init();
    const absolute = Path.join(__dirname, "../../tree-sitter-elm.wasm");
    const pathToWasm = Path.relative(process.cwd(), absolute);

    const language = await Parser.Language.load(pathToWasm);
    this.parser = new Parser();
    this.parser.setLanguage(language);
  }

  public getWorkspace(source: string[]): IElmWorkspace {
    return new MockElmWorkspace(source.join("\n"), this.parser!);
  }
}
