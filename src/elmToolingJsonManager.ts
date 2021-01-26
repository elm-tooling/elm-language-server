import path from "path";
import { URI } from "vscode-uri";
import { ITreeContainer } from "./forest";
import { NonEmptyArray } from "./util/utils";
import util from "util";
import * as fs from "fs";

const readFile = util.promisify(fs.readFile);

export class ElmToolingJsonManager {
  public async getEntrypoints(
    workspaceRootPath: string,
    sourceFile: ITreeContainer,
  ): Promise<[NonEmptyArray<string>, string]> {
    const elmToolingPath = path.join(workspaceRootPath, "elm-tooling.json");
    const defaultRelativePathToFile = path.relative(
      workspaceRootPath,
      URI.parse(sourceFile.uri).fsPath,
    );
    return await readFile(elmToolingPath, {
      encoding: "utf-8",
    })
      .then(JSON.parse)
      .then(this.elmToolingEntrypointsDecoder.bind(this))
      .then(
        (entrypoints) => [
          entrypoints,
          `Using entrypoints from ${elmToolingPath}: ${JSON.stringify(
            entrypoints,
          )}`,
        ],
        (error: Error & { code?: string }) => {
          const innerMessage =
            error.code === "ENOENT"
              ? `No elm-tooling.json found in ${workspaceRootPath}.`
              : error.code === "EISDIR"
              ? `Skipping ${elmToolingPath} because it is a directory, not a file.`
              : error instanceof SyntaxError
              ? `Skipping ${elmToolingPath} because it contains invalid JSON: ${error.message}.`
              : `Skipping ${elmToolingPath} because: ${error.message}.`;
          const fullMessage = `Using default entrypoint: ${defaultRelativePathToFile}. ${innerMessage}`;

          return [[defaultRelativePathToFile], fullMessage];
        },
      );
  }
  private elmToolingEntrypointsDecoder(json: unknown): NonEmptyArray<string> {
    if (typeof json === "object" && json !== null && !Array.isArray(json)) {
      if ("entrypoints" in json) {
        const { entrypoints } = json as { [key: string]: unknown };
        if (Array.isArray(entrypoints) && entrypoints.length > 0) {
          const result: Array<string> = [];
          for (const [index, item] of entrypoints.entries()) {
            if (typeof item === "string" && item.startsWith("./")) {
              result.push(item);
            } else {
              throw new Error(
                `Expected "entrypoints" to contain string paths starting with "./" but got: ${JSON.stringify(
                  item,
                )} at index ${index}`,
              );
            }
          }
          return [result[0], ...result.slice(1)];
        } else {
          throw new Error(
            `Expected "entrypoints" to be a non-empty array but got: ${JSON.stringify(
              json,
            )}`,
          );
        }
      } else {
        throw new Error(`There is no "entrypoints" field.`);
      }
    } else {
      throw new Error(
        `Expected a JSON object but got: ${JSON.stringify(json)}`,
      );
    }
  }
}
