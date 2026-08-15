import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { createRequire } from "module";
import * as path from "path";
import { Language, Parser, Query, Tree } from "web-tree-sitter";
import {
  applyChangesToTree,
  parseOrThrow,
} from "../src/common/util/treeSitter";

describe("tree-sitter", () => {
  let language: Language;
  let parser: Parser;

  beforeAll(async () => {
    await Parser.init();
    language = await Language.load(
      readFileSync(path.join(__dirname, "../tree-sitter-elm.wasm")),
    );
    parser = new Parser().setLanguage(language);
  });

  it("loads the checked-in Elm grammar and runs a query", () => {
    expect(language.abiVersion).toBe(15);
    expect(language.name).toBe("elm");
    expect(language.metadata).toEqual({
      major_version: 5,
      minor_version: 9,
      patch_version: 4,
    });

    const tree = parseOrThrow(
      parser,
      "module Main exposing (main)\n\nmain = 1\n",
    );
    const query = new Query(
      language,
      "(module_declaration (upper_case_qid) @module)",
    );

    expect(tree.rootNode.hasError).toBe(false);
    expect(query.matches(tree.rootNode)[0].captures[0]).toMatchObject({
      name: "module",
      node: { text: "Main" },
    });
  });

  it("fails clearly when parsing without a language", () => {
    expect(() => parseOrThrow(new Parser(), "main = 1")).toThrow(
      "Tree-sitter parsing failed because the parser has no language or parsing was cancelled.",
    );
  });

  it("loads custom core and grammar WASM locations", () => {
    const coreWasmPath = createRequire(__filename).resolve(
      "web-tree-sitter/web-tree-sitter.wasm",
    );
    const grammarWasmPath = path.join(__dirname, "../tree-sitter-elm.wasm");
    const script = `
      const { Language, Parser } = require("web-tree-sitter");
      (async () => {
        let coreLocated = false;
        await Parser.init({
          locateFile() {
            coreLocated = true;
            return ${JSON.stringify(coreWasmPath)};
          },
        });
        const language = await Language.load(${JSON.stringify(grammarWasmPath)});
        const tree = new Parser().setLanguage(language).parse("main = 1");
        if (!coreLocated || !tree) {
          throw new Error("Custom WASM initialization failed.");
        }
      })().catch((error) => {
        console.error(error);
        process.exit(1);
      });
    `;

    const result = spawnSync(process.execPath, ["-e", script], {
      encoding: "utf8",
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it.each([
    {
      name: "a single edit",
      source: "module Main exposing (main)\n\nmain = 1\n",
      replacements: [["1", "42"]],
      expectChangedRanges: false,
      expectStringLocations: false,
    },
    {
      name: "multiple sequential edits",
      source: "module Main exposing (main)\n\nmain = 1 + 2\n",
      replacements: [
        ["1", "10"],
        ["2", "20"],
      ],
      expectChangedRanges: false,
      expectStringLocations: false,
    },
    {
      name: "a multiline edit",
      source: "module Main exposing (main)\n\nmain = 1\n",
      replacements: [["main = 1", "helper = 1\n\nmain = helper"]],
      expectChangedRanges: true,
      expectStringLocations: false,
    },
    {
      name: "non-ASCII sequential edits",
      source: 'module Main exposing (main)\n\nmain = "Jorg" ++ "x"\n',
      replacements: [
        ['"Jorg"', '"Jorg 😀"'],
        ['"x"', '"Munchen"'],
      ],
      expectChangedRanges: true,
      expectStringLocations: true,
    },
  ])(
    "incrementally reparses $name",
    ({ source, replacements, expectChangedRanges, expectStringLocations }) => {
      let editedSource = source;
      const oldTree = parseOrThrow(parser, editedSource);
      const contentChanges = replacements.map(([oldText, newText]) => {
        const startIndex = editedSource.indexOf(oldText);
        expect(startIndex).toBeGreaterThanOrEqual(0);
        const oldEndIndex = startIndex + oldText.length;
        const change = {
          range: {
            start: positionAt(editedSource, startIndex),
            end: positionAt(editedSource, oldEndIndex),
          },
          text: newText,
        };

        editedSource =
          editedSource.slice(0, startIndex) +
          newText +
          editedSource.slice(oldEndIndex);
        return change;
      });

      applyChangesToTree(oldTree, contentChanges);

      const incrementalTree = parseOrThrow(parser, editedSource, oldTree);
      const freshTree = parseOrThrow(parser, editedSource);

      expect(incrementalTree.rootNode.text).toBe(editedSource);
      expect(incrementalTree.rootNode.hasError).toBe(false);
      expect(incrementalTree.rootNode.toString()).toBe(
        freshTree.rootNode.toString(),
      );
      if (expectChangedRanges) {
        expect(
          oldTree.getChangedRanges(incrementalTree).length,
        ).toBeGreaterThan(0);
      }
      if (expectStringLocations) {
        expect(
          incrementalTree.rootNode
            .descendantsOfType("string_constant_expr")
            .map((node) => ({
              text: node.text,
              startIndex: node.startIndex,
              endIndex: node.endIndex,
              startPosition: node.startPosition,
              endPosition: node.endPosition,
            })),
        ).toEqual([
          {
            text: '"Jorg 😀"',
            startIndex: 36,
            endIndex: 45,
            startPosition: { row: 2, column: 7 },
            endPosition: { row: 2, column: 16 },
          },
          {
            text: '"Munchen"',
            startIndex: 49,
            endIndex: 58,
            startPosition: { row: 2, column: 20 },
            endPosition: { row: 2, column: 29 },
          },
        ]);
      }
    },
  );

  it("applies a full-document change", () => {
    const tree = parseOrThrow(parser, "main = 1\n");
    const source = "main = 2\n";

    applyChangesToTree(tree, [{ text: source }]);
    const incrementalTree = parseOrThrow(parser, source, tree);

    expect(incrementalTree.rootNode.text).toBe(source);
    expect(incrementalTree.rootNode.hasError).toBe(false);
  });

  it("uses the source endpoint for a full-document edit", () => {
    const edit = jest.fn();
    const tree = {
      rootNode: { text: "main = 1\n" },
      edit,
    } as unknown as Tree;

    applyChangesToTree(tree, [{ text: "main = 2\n" }]);

    expect(edit).toHaveBeenCalledWith(
      expect.objectContaining({
        oldEndIndex: 9,
        oldEndPosition: { row: 1, column: 0 },
      }),
    );
  });
});

function positionAt(
  source: string,
  index: number,
): { line: number; character: number } {
  const lines = source.slice(0, index).split("\n");
  return {
    line: lines.length - 1,
    character: lines[lines.length - 1].length,
  };
}
