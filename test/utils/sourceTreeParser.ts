import * as path from "path";
import Parser from "web-tree-sitter";
import { ElmWorkspace, IElmWorkspace } from "../../src/elmWorkspace";
import { container } from "tsyringe";
import { URI } from "vscode-uri";

export const baseUri = URI.parse(path.join(__dirname, "../sources/src/"));

export class SourceTreeParser {
  private parser?: Parser;

  public async init(): Promise<void> {
    if (this.parser) {
      return;
    }

    await Parser.init();
    const absolute = path.join(__dirname, "../../tree-sitter-elm.wasm");
    const pathToWasm = path.relative(process.cwd(), absolute);

    const language = await Parser.Language.load(pathToWasm);
    container.registerSingleton("Parser", Parser);
    container.resolve<Parser>("Parser").setLanguage(language);
  }

  public async getProgram(sources: {
    [K: string]: string;
  }): Promise<IElmWorkspace> {
    const readFile = (uri: URI): string => {
      if (uri.fsPath.endsWith("elm.json")) {
        return `
        {
          "type": "application",
          "source-directories": [
              "."
          ],
          "elm-version": "0.19.1",
          "dependencies": {
              "direct": {},
              "indirect": {}
          },
          "test-dependencies": {
              "direct": {},
              "indirect": {}
          }
        }
        `;
      }

      return sources[path.relative(baseUri.fsPath, uri.fsPath)];
    };

    const program = new ElmWorkspace(URI.parse(baseUri.fsPath), {
      readFile: (uri: URI): Promise<string> => Promise.resolve(readFile(uri)),
      readFileSync: readFile,
      readDirectory: (uri: URI): Promise<URI[]> => {
        return Promise.resolve(
          path.parse(uri.fsPath).dir === path.parse(baseUri.fsPath).dir
            ? Object.keys(sources).map((sourceUri) =>
                URI.parse(path.join(uri.fsPath, sourceUri)),
              )
            : [],
        );
      },
    });

    await program.init(() => {
      //
    });

    return program;
  }
}
