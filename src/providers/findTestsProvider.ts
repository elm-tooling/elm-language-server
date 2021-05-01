import { container } from "tsyringe";
import { Connection, ResponseError } from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { ISourceFile } from "../compiler/forest";
import { Program } from "../compiler/program";
import { TypeChecker } from "../compiler/typeChecker";
import { Type } from "../compiler/typeInference";
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
            )?.map((top) => {
              connection.console.info(`Finding tests is in top ${top?.id}`);
              return (
                top &&
                findTestSuite(
                  findTestFunctionCall(top, typeChecker),
                  sourceFile,
                  typeChecker,
                )
              );
            });
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
  // console.log("FW0", typeChecker.typeToString(typeChecker.findType(node)));
  const call = findExpr("FunctionCallExpr", node);
  if (!call) {
    return undefined;
  }
  const t: Type = typeChecker.findType(call);
  // TODO why are there two cases here?
  if (t.nodeType === "Function") {
    if (
      t.return.nodeType === "Union" &&
      t.return.module === "Test.Internal" &&
      t.return.name === "Test"
    ) {
      return call;
    }
  }
  if (
    t.nodeType === "Union" &&
    t.module === "Test.Internal" &&
    t.name === "Test"
  ) {
    return call;
  }
  console.log("FW", t);
  return undefined;
}

function isTestSuite(
  call: EFunctionCallExpr,
  sourceFile: ISourceFile,
  typeChecker: TypeChecker,
): boolean {
  const funName = findExpr("ValueExpr", call.target)?.name;
  const dot = funName?.lastIndexOf(".") ?? -1;
  const prefix = dot > -1 ? funName?.substring(0, dot) : undefined;
  const qualifier: string =
    prefix !== undefined
      ? typeChecker.getQualifierForName(sourceFile, prefix, "describe") ?? ""
      : "";
  const moduleName =
    prefix !== undefined
      ? typeChecker.findImportModuleNameNode(prefix, sourceFile)?.text
      : "Test";
  return (
    qualifier !== undefined &&
    funName === `${qualifier}describe` &&
    moduleName === "Test"
  );
}

// export for testing
export function findTestSuite(
  call: EFunctionCallExpr | undefined,
  sourceFile: ISourceFile,
  typeChecker: TypeChecker,
): TestSuite | undefined {
  if (!call) {
    return undefined;
  }
  const labelParts = findAllExprs("StringConstant", call.args[0])?.map(
    (e) => e.text,
  );
  const label = labelParts?.length === 1 ? labelParts[0] : labelParts;
  if (label && isTestSuite(call, sourceFile, typeChecker)) {
    const testExprs = findExpr("ListExpr", call.args[1])?.exprList;
    const tests = testExprs
      ?.map((e) => findTestFunctionCall(e, typeChecker))
      .map((call) => findTestSuite(call, sourceFile, typeChecker));
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

function findAllExprs<K extends keyof ExpressionNodeTypes>(
  key: K,
  node: SyntaxNode | undefined,
): ExpressionNodeTypes[K][] | undefined {
  if (!node) {
    return undefined;
  }
  const type = typeByNodeType.get(key);
  if (!type) {
    return undefined;
  }
  const children = TreeUtils.findAllNamedChildrenOfType(type, node);
  const ns = node.type === type ? [node, ...(children ?? [])] : children;
  const es = ns?.map((n) => mapSyntaxNodeToExpression(n));
  return es?.map((e) => e && mapExpr(key, e)).flatMap((v) => (v ? [v] : []));
}

function mapExpr<K extends keyof ExpressionNodeTypes>(
  k: K,
  e: Expression,
): ExpressionNodeTypes[K] | undefined {
  return e?.nodeType === k ? (e as ExpressionNodeTypes[K]) : undefined;
}
