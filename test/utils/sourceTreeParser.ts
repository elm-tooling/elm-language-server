import { container } from "tsyringe";
import { TextEdit } from "vscode-languageserver-textdocument";
import { URI, Utils as UriUtils } from "vscode-uri";
import Parser from "web-tree-sitter";
import { Program, IProgram, IProgramHost } from "../../src/compiler/program";
import * as path from "../../src/util/path";
import { Utils } from "../../src/util/utils";
import { promisify } from "util";
import { readFile, readdir } from "fs";
import globby from "globby";

export const baseUri = path.join(__dirname, "../sources/");
export const srcUri = URI.file(path.join(baseUri, "src"));
export const testsUri = URI.file(path.join(baseUri, "tests"));

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

  public async getProgram(sources: { [K: string]: string }): Promise<IProgram> {
    const readFile = (uri: URI): string => {
      if (uri.toString().endsWith("elm.json")) {
        return `
        {
          "type": "application",
          "source-directories": [
              "src"
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

      return (
        sources[path.relative(srcUri.toString(), uri.toString())] ??
        testSources[path.relative(testsUri.toString(), uri.toString())]
      );
    };

    // Separate test sources
    const testSources: { [K: string]: string } = {};
    for (const key in sources) {
      if (key.startsWith("tests/")) {
        testSources[key.substring(6, key.length)] = sources[key];
        delete sources[key];
      }
    }

    const program = new Program(URI.file(baseUri), {
      readFile: (uri: URI): Promise<string> => Promise.resolve(readFile(uri)),
      readDirectory: (uri: URI): Promise<URI[]> =>
        Promise.resolve(
          uri.toString() === srcUri.toString()
            ? Object.keys(sources).map((sourceUri) =>
                UriUtils.joinPath(uri, sourceUri),
              )
            : uri.toString() === testsUri.toString()
            ? Object.keys(testSources).map((testUri) =>
                UriUtils.joinPath(uri, testUri),
              )
            : [],
        ),
      watchFile: (): void => {
        return;
      },
    });

    await program.init(() => {
      //
    });

    return program;
  }
}

export function createProgramHost(): IProgramHost {
  return {
    readFile: (uri: URI): Promise<string> =>
      promisify(readFile)(uri.fsPath, {
        encoding: "utf-8",
      }),
    readDirectory: async (uri: URI, include, depth): Promise<URI[]> => {
      // Cleanup the path on windows, as globby does not like backslashes
      const result =
        depth === 1
          ? await promisify(readdir)(uri.fsPath)
          : await globby(`${uri.fsPath.replace(/\\/g, "/")}/${include}`, {
              suppressErrors: true,
            });
      return result.map((file) => URI.file(file));
    },
    watchFile: (): void => {
      return;
    },
  };
}

export function applyEditsToSource(source: string, edits: TextEdit[]): string {
  let result = source;

  let indexOffset = 0;
  edits
    .map((edit) => {
      const [startIndex, endIndex] = Utils.getIndicesFromRange(
        edit.range,
        source,
      );
      return { ...edit, startIndex, endIndex };
    })
    .sort((a, b) => a.startIndex - b.startIndex)
    .forEach((edit) => {
      const startIndex = edit.startIndex + indexOffset;
      const endIndex = edit.endIndex + indexOffset;

      indexOffset += edit.newText.length - (endIndex - startIndex);

      result =
        result.substring(0, startIndex) +
        edit.newText +
        result.substring(endIndex, result.length);
    });

  return result;
}

/**
 * Remove lines with any comment
 */
export function stripCommentLines(source: string): string {
  return source
    .split("\n")
    .filter((line) => !RegExp(/--/).exec(line))
    .join("\n");
}

export function trimTrailingWhitespace(source: string): string {
  return source
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}
