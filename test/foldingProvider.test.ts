import { describe, expect, it } from "@jest/globals";
import { container } from "tsyringe";
import { FoldingRange, FoldingRangeKind } from "vscode-languageserver";
import { Utils as UriUtils } from "vscode-uri";
import { IProgram } from "../src/compiler/program.js";
import { ISourceFile } from "../src/compiler/forest.js";
import { FoldingRangeProvider } from "../src/common/providers/foldingProvider.js";
import { IFoldingRangeParams } from "../src/common/providers/paramsExtensions.js";
import { SourceTreeParser, srcUri } from "./utils/sourceTreeParser.js";

class TestFoldingRangeProvider extends FoldingRangeProvider {
  public getFoldingRanges(param: IFoldingRangeParams): FoldingRange[] {
    return this.handleFoldingRange(param);
  }
}

describe("FoldingRangeProvider", () => {
  const treeParser = new SourceTreeParser();

  async function getFoldingRanges(source: string): Promise<FoldingRange[]> {
    await treeParser.init();
    const program: IProgram = await treeParser.getProgram({
      "Main.elm": source,
    });
    container.register("ElmWorkspaces", { useValue: [program] });

    const uri = UriUtils.joinPath(srcUri, "Main.elm").toString();
    const sourceFile: ISourceFile | undefined = program.getSourceFile(uri);

    if (!sourceFile) {
      throw new Error("Failed to resolve source file for folding test.");
    }

    const provider = new TestFoldingRangeProvider();

    return provider.getFoldingRanges({
      textDocument: { uri },
      program,
      sourceFile,
    });
  }

  it("adds a region fold for #region comments", async () => {
    const source = [
      "module Main exposing (..)",
      "",
      "-- #region example",
      "foo =",
      "    1",
      "-- #endregion",
    ].join("\n");

    const folds = await getFoldingRanges(source);

    expect(folds).toContainEqual(
      expect.objectContaining({
        kind: FoldingRangeKind.Region,
        startLine: 2,
        endLine: 5,
      }),
    );
  });

  it("supports nested and non-hash region markers", async () => {
    const source = [
      "module Main exposing (..)",
      "",
      "-- region outer",
      "foo = 1",
      "-- #region inner",
      "bar = 2",
      "-- #endregion",
      "baz = 3",
      "-- endregion",
    ].join("\n");

    const folds = await getFoldingRanges(source);

    const markerFolds = folds.filter(
      (fold) =>
        fold.kind === FoldingRangeKind.Region &&
        ((fold.startLine === 2 && fold.endLine === 8) ||
          (fold.startLine === 4 && fold.endLine === 6)),
    );

    expect(markerFolds).toHaveLength(2);
  });
});
