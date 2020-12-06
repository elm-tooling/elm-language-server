import { debug } from "console";
import { URI } from "vscode-uri";
import { SyntaxNode } from "web-tree-sitter";
import { convertFromAnalyzerDiagnostic } from "../../src/providers";
import { diagnosticsEquals } from "../../src/providers/diagnostics/fileDiagnostics";
import { TreeUtils } from "../../src/util/treeUtils";
import {
  Diagnostic,
  Diagnostics,
  error,
  IDiagnosticMessage,
} from "../../src/util/types/diagnostics";
import { Utils } from "../../src/util/utils";
import { baseUri } from "../utils/mockElmWorkspace";
import {
  getSourceFiles,
  getTargetPositionFromSource,
} from "../utils/sourceParser";
import { SourceTreeParser } from "../utils/sourceTreeParser";

const basicsSources = `
--@ Basics.elm
module Basics exposing ((+), (|>), (==), Int, Float, Bool(..), Order(..))

infix left  0 (|>) = apR
infix non   4 (==) = eq
infix left  6 (+)  = add

type Int = Int

type Float = Float

type Bool = True | False

add : number -> number -> number
add =
  Elm.Kernel.Basics.add

apR : a -> (a -> b) -> b
apR x f =
  f x

eq : a -> a -> Bool
eq =
  Elm.Kernel.Utils.equal

type Order = LT | EQ | GT
`;
describe("test elm diagnostics", () => {
  const treeParser = new SourceTreeParser();

  const debug = process.argv.find((arg) => arg === "--debug");

  async function testTypeInference(
    source: string,
    expectedDiagnostics: {
      message: IDiagnosticMessage;
      args: (string | number)[];
    }[],
  ) {
    await treeParser.init();

    const result = getTargetPositionFromSource(source) ?? {
      sources: getSourceFiles(source),
    };

    if (!result) {
      throw new Error("Getting sources failed");
    }

    const testUri = URI.file(baseUri + "Test.elm").toString();

    const program = treeParser.getWorkspace(result.sources);
    const treeContainer = program.getForest().getByUri(testUri);

    if (!treeContainer) throw new Error("Getting tree failed");

    const diagnostics: Diagnostic[] = [];

    program.getForest().treeMap.forEach((treeContainer) => {
      if (!treeContainer.uri.includes("Basic")) {
        diagnostics.push(...program.getSyntacticDiagnostics(treeContainer));
        diagnostics.push(...program.getSemanticDiagnostics(treeContainer));
        diagnostics.push(...program.getSuggestionDiagnostics(treeContainer));
      }
    });

    let nodeAtPosition: SyntaxNode;

    if ("position" in result) {
      const rootNode = program.getForest().treeMap.get(testUri)!.tree.rootNode;
      nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        rootNode,
        result.position,
      );
    }

    const expected = expectedDiagnostics.map((exp) =>
      convertFromAnalyzerDiagnostic(
        error(nodeAtPosition, exp.message, ...exp.args),
      ),
    );

    const diagnosticsEqual = Utils.arrayEquals(
      diagnostics.map(convertFromAnalyzerDiagnostic),
      expected,
      diagnosticsEquals,
    );

    if (debug && !diagnosticsEqual) {
      console.log(
        `Expecting ${JSON.stringify(expected)}, got ${JSON.stringify(
          diagnostics,
        )}`,
      );
    }

    expect(diagnosticsEqual).toBeTruthy();
  }

  test("aliased function return", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Comparator a =
    a -> a -> Order

concat : List (Comparator a) -> Comparator a
concat comparators a b =
    case comparators of
        [] ->
            EQ

        comparator :: rest ->
            case comparator a b of
                EQ -> 
                    concat rest a b

                order ->
                    order
`;
    await testTypeInference(basicsSources + source, []);
  });

  test("missing import", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import App
      --^

func : Int
func = 5
`;
    await testTypeInference(basicsSources + source, [
      { message: Diagnostics.ImportMissing, args: ["App"] },
    ]);
  });

  test("Shadowing a function with the same name", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Model =
    { field : Int
    }

field : Model -> Int
field { field } =
        --^
    4
`;
    await testTypeInference(basicsSources + source, [
      { message: Diagnostics.Redefinition, args: ["field"] },
    ]);
  });

  test("Type class used with a suffix", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

field : number1
field =
    4
  `;
    await testTypeInference(basicsSources + source, []);
  });
});
