import { readFile } from "fs";
import globby from "globby";
import { container } from "tsyringe";
import { promisify } from "util";
import { TextEdit } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import Parser from "web-tree-sitter";
import {
  ElmWorkspace,
  IElmWorkspace,
  IProgramHost,
} from "../../src/elmWorkspace";
import * as path from "../../src/util/path";
import { Utils } from "../../src/util/utils";

export const baseUri = path.join(__dirname, "../sources/src/");
const testUri = path.join(baseUri, "tests");

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

      return (
        sources[path.relative(baseUri, uri)] ??
        testSources[path.relative(testUri, uri)]
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

    const program = new ElmWorkspace(URI.file(baseUri), {
      readFile: (uri: string): Promise<string> =>
        Promise.resolve(readFile(uri)),
      readDirectory: (uri: string): Promise<string[]> => {
        return Promise.resolve(
          path.normalizeUri(uri) ===
            path.normalizeUri(baseUri.substr(0, baseUri.length - 1)) // Remove trailing / from baseUri
            ? Object.keys(sources).map((sourceUri) => path.join(uri, sourceUri))
            : path.normalizeUri(uri) === path.normalizeUri(testUri)
            ? Object.keys(testSources).map((testUri) => path.join(uri, testUri))
            : [],
        );
      },
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
    readFile: (uri): Promise<string> =>
      promisify(readFile)(uri, {
        encoding: "utf-8",
      }),
    readDirectory: (uri: string): Promise<string[]> =>
      // Cleanup the path on windows, as globby does not like backslashes
      globby(`${uri.replace(/\\/g, "/")}/**/*.elm`, {
        suppressErrors: true,
      }),
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
