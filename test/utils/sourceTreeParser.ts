import { parse } from "path";
import { container } from "tsyringe";
import { URI, uriToFsPath } from "vscode-uri";
import Parser from "web-tree-sitter";
import { ElmWorkspace, IElmWorkspace } from "../../src/elmWorkspace";
import * as path from "../../src/util/path";

export const baseUri = path.join(__dirname, "../sources/src/");

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
    const readFile = (uri: string): string => {
      if (uri.endsWith("elm.json")) {
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

      return sources[path.relative(baseUri, uri)];
    };

    const program = new ElmWorkspace(URI.file(baseUri), {
      readFile: (uri: string): Promise<string> =>
        Promise.resolve(readFile(uri)),
      readFileSync: readFile,
      readDirectory: (uri: string): Promise<string[]> => {
        console.log(uri);
        console.log(path.normalizeUri(baseUri.substr(0, baseUri.length - 1)));
        return Promise.resolve(
          path.normalizeUri(uri) ===
            path.normalizeUri(baseUri.substr(0, baseUri.length - 1)) // Remove trailing / from baseUri
            ? Object.keys(sources).map((sourceUri) => path.join(uri, sourceUri))
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
