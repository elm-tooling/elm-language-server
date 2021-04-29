import { getSourceFiles } from "./utils/sourceParser";
import { baseUri, SourceTreeParser } from "./utils/sourceTreeParser";
import { URI } from "vscode-uri";
import { TreeUtils } from "../src/util/treeUtils";
import {
  EFunctionCallExpr,
  EListExpr,
  EValueExpr,
  EStringConstant,
  Expression,
  mapSyntaxNodeToExpression,
} from "../src/compiler/utils/expressionTree";
import { SyntaxNode } from "web-tree-sitter";

const source = `
--@ TestModule.elm
module TestModule exposing (..)

import Expect
import Test exposing (..)

topSuite : Test
topSuite =
    describe "top suite"
        [ test "first" <| \_ -> Expect.equal 13 13
        , describe "nested"
            [ test "second" <| \_ -> Expect.equal 14 14
            ]
        ]
`;

describe("find tests", () => {
  const treeParser = new SourceTreeParser();

  async function testFindTests(source: string, expected: TestSuite[]) {
    await treeParser.init();

    const sources = getSourceFiles(source);
    const testModuleUri = URI.file(baseUri + "TestModule.elm").toString();

    const program = await treeParser.getProgram(sources);
    const sourceFile = program.getSourceFile(testModuleUri);
    expect(sourceFile).not.toBeUndefined;
    if (!sourceFile) {
      throw new Error("parsing failed");
    }
    expect(sourceFile.isTestFile).toBeTruthy;

    const tops = TreeUtils.findAllTopLevelFunctionDeclarations(sourceFile.tree);

    const suites = tops
      ? tops.map((top) => findTestSuite(findExpr("FunctionCallExpr", top)))
      : [];
    expect(suites).toEqual(expected);
  }

  test("first", async () => {
    await testFindTests(source, [
      {
        tag: "suite",
        label: '"top suite"',
        tests: [
          { tag: "test", label: '"first"' },
          {
            tag: "suite",
            label: '"nested"',
            tests: [{ tag: "test", label: '"second"' }],
          },
        ],
      },
    ]);
  });
});

type TestSuite =
  | { tag: "test"; label: string }
  | { tag: "suite"; label: string; tests: TestSuite[] };

function findTestSuite(
  call: EFunctionCallExpr | undefined,
): TestSuite | undefined {
  if (!call) {
    return undefined;
  }
  const funName = findExpr("ValueExpr", call.target)?.name;
  const label = findExpr("StringConstant", call.args[0])?.text;
  if (label && funName === "describe") {
    const testExprs = findExpr("ListExpr", call.args[1])?.exprList;
    const tests = testExprs
      ?.map((e) => findExpr("FunctionCallExpr", e))
      .map((call) => findTestSuite(call));
    return tests && <TestSuite>{ tag: "suite", label, tests };
  }
  return label ? <TestSuite>{ tag: "test", label } : undefined;
}

type ExpressionNodeTypes = {
  ValueExpr: EValueExpr;
  StringConstant: EStringConstant;
  ListExpr: EListExpr;
  FunctionCallExpr: EFunctionCallExpr;
};

type TypeExpressionNodeTypes = {
  value_expr: EValueExpr;
  string_constant_expr: EStringConstant;
  list_expr: EListExpr;
  function_call_expr: EFunctionCallExpr;
};

const typeByNodeType: Map<
  keyof ExpressionNodeTypes,
  keyof TypeExpressionNodeTypes
> = new Map([
  ["ValueExpr", "value_expr"],
  ["StringConstant", "string_constant_expr"],
  ["ListExpr", "list_expr"],
  ["FunctionCallExpr", "function_call_expr"],
]);

function findExpr<K extends keyof ExpressionNodeTypes>(
  key: K,
  node: SyntaxNode | undefined,
): ExpressionNodeTypes[K] | undefined {
  if (!node) {
    return undefined;
  }
  const type = typeByNodeType.get(key);
  if (!type) {
    return undefined;
  }
  const n =
    node.type === type ? node : TreeUtils.findFirstNamedChildOfType(type, node);
  const e = mapSyntaxNodeToExpression(n);
  return e && mapExpr(key, e);
}

function mapExpr<K extends keyof ExpressionNodeTypes>(
  k: K,
  e: Expression,
): ExpressionNodeTypes[K] | undefined {
  return e?.nodeType === k ? (e as ExpressionNodeTypes[K]) : undefined;
}
