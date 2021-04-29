import { container } from "tsyringe";
import { Connection } from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
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
} from "../protocol";
import { TreeUtils } from "../util/treeUtils";

export class FindTestsProvider {
  constructor() {
    this.register();
  }

  private register(): void {
    const connection = container.resolve<Connection>("Connection");
    connection.onRequest(FindTestsRequest, (params: IFindTestsParams) => {
      connection.console.info(`Finding tests is requested`);
      connection.window.showInformationMessage("hello there " + params.text);
      connection.console.log("hello there " + params.text);
      // connection.sendNotification(NotificationType, {});
      return <IFindTestsResponse>{ text: "echo " + params.text };
    });
  }
}

// export for testing
export type TestSuite =
  | { tag: "test"; label: string }
  | { tag: "suite"; label: string; tests: TestSuite[] };

// export for testing
export function findTestFunctionCall(
  node: SyntaxNode,
): EFunctionCallExpr | undefined {
  return findExpr("FunctionCallExpr", node);
}

// export for testing
export function findTestSuite(
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
      ?.map((e) => findTestFunctionCall(e))
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
