import { container } from "tsyringe";
import { Connection, ResponseError } from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { Program } from "../compiler/program";
import { createTypeChecker, TypeChecker } from "../compiler/typeChecker";
import { TFunction, TUnion, Type } from "../compiler/typeInference";
import {
  EFunctionCallExpr,
  EValueExpr,
  EStringConstant,
  EListExpr,
  mapSyntaxNodeToExpression,
  Expression,
} from "../compiler/utils/expressionTree";
import {
  FindTestsRequest,
  IFindTestsParams,
  IFindTestsResponse,
  TestSuite,
} from "../protocol";
import { NoWorkspaceContainsError } from "../util/noWorkspaceContainsError";
import { TreeUtils } from "../util/treeUtils";

export class FindTestsProvider {
  constructor() {
    this.register();
  }

  private register(): void {
    const connection = container.resolve<Connection>("Connection");
    connection.onRequest(FindTestsRequest, (params: IFindTestsParams) => {
      connection.console.info(
        `Finding tests is requested ${params.workspaceRoot}`,
      );
      try {
        const elmWorkspaces: Program[] = container.resolve("ElmWorkspaces");
        const program = elmWorkspaces.find(
          (program) =>
            program.getRootPath().toString() == params.workspaceRoot.toString(),
        );
        if (!program) {
          // TODO dedicated error?
          throw new NoWorkspaceContainsError(params.workspaceRoot);
        }
        const typeChecker = program.getTypeChecker();
        const tests = Array.from(program.getForest().treeMap.values())
          .filter((sourceFile) => sourceFile.isTestFile)
          .flatMap((sourceFile) => {
            connection.console.info(`Finding tests is in ${sourceFile.uri}`);
            return TreeUtils.findAllTopLevelFunctionDeclarations(
              sourceFile.tree,
            );
          })
          .map((top) => {
            connection.console.info(`Finding tests is in top ${top?.id}`);
            return (
              top &&
              findTestSuite(findTestFunctionCall(top, typeChecker), typeChecker)
            );
          })
          .flatMap((s) => (s ? [s] : []));
        const suite: TestSuite = {
          tag: "suite",
          label: program.getRootPath().path,
          tests,
        };
        connection.console.info(
          `Found ${tests.length} tests in ${params.workspaceRoot}`,
        );
        return <IFindTestsResponse>{ suite };
      } catch (err) {
        console.log("FW", err);
        connection.console.error(`Error finding tests`);
        return new ResponseError(13, "boom");
      }
    });
  }
}

// export for testing
export function findTestFunctionCall(
  node: SyntaxNode,
  typeChecker: TypeChecker,
): EFunctionCallExpr | undefined {
  const call = findExpr("FunctionCallExpr", node);
  if (!call) {
    return undefined;
  }
  const t: Type = typeChecker.findType(call);
  // TODO why are there two cases here?
  if (t.nodeType === "Function") {
    if (
      t.return.nodeType === "Union" &&
      // TODO adjust test fixture!
      (t.return.module === "Test" || t.return.module === "Test.Internal") &&
      t.return.name === "Test"
    ) {
      return call;
    }
  }
  if (
    t.nodeType === "Union" &&
    // TODO adjust test fixture!
    (t.module === "Test" || t.module === "Test.Internal") &&
    t.name === "Test"
  ) {
    return call;
  }
  console.log("FW", t);
  return undefined;
}

function isTestSuite(
  call: EFunctionCallExpr,
  typeChecker: TypeChecker,
): boolean {
  const funName = findExpr("ValueExpr", call.target)?.name;
  // const t: Type = typeChecker.findType(call);
  // console.log("FW", t);
  return funName === "describe";
}

// export for testing
export function findTestSuite(
  call: EFunctionCallExpr | undefined,
  typeChecker: TypeChecker,
): TestSuite | undefined {
  if (!call) {
    return undefined;
  }
  const label = findExpr("StringConstant", call.args[0])?.text;
  if (label && isTestSuite(call, typeChecker)) {
    const testExprs = findExpr("ListExpr", call.args[1])?.exprList;
    const tests = testExprs
      ?.map((e) => findTestFunctionCall(e, typeChecker))
      .map((call) => findTestSuite(call, typeChecker));
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
