import { container } from "tsyringe";
import { Connection, ResponseError } from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { ISourceFile } from "../compiler/forest";
import { IProgram, Program } from "../compiler/program";
import { TypeChecker } from "../compiler/typeChecker";
import { Type } from "../compiler/typeInference";
import {
  EFunctionCallExpr,
  EValueExpr,
  EStringConstant,
  EListExpr,
  mapSyntaxNodeToExpression,
  Expression,
  ELetInExpr,
} from "../compiler/utils/expressionTree";
import {
  FindTestsRequest,
  IFindTestsParams,
  IFindTestsResponse,
  TestSuite,
} from "../protocol";
import { NoWorkspaceContainsError } from "../util/noWorkspaceContainsError";
import { TreeUtils } from "../util/treeUtils";
import { Utils } from "../util/utils";

export class FindTestsProvider {
  constructor() {
    const connection = container.resolve<Connection>("Connection");
    connection.onRequest(FindTestsRequest, (params: IFindTestsParams) => {
      connection.console.info(
        `Finding tests is requested ${params.projectFolder.toString()}`,
      );
      try {
        const elmWorkspaces: Program[] = container.resolve("ElmWorkspaces");
        const program = elmWorkspaces.find(
          (program) =>
            program.getRootPath().toString() == params.projectFolder.toString(),
        );
        if (!program) {
          throw new NoWorkspaceContainsError(params.projectFolder);
        }
        const suites = findAllTestSuites(program);
        connection.console.info(
          `Found ${
            suites.length
          } top test suites in ${params.projectFolder.toString()}`,
        );
        return <IFindTestsResponse>{ suites };
      } catch (error) {
        connection.console.error(`Error finding tests ${error}`);
        return new ResponseError(1, `Error finding tests ${error}`);
      }
    });
  }
}

// export for testing
export function findAllTestSuites(program: IProgram): TestSuite[] {
  const typeChecker = program.getTypeChecker();
  return Array.from(program.getForest(true).treeMap.values())
    .filter((sourceFile) => sourceFile.isTestFile)
    .map((sourceFile) => {
      const topSuites = TreeUtils.findAllTopLevelFunctionDeclarations(
        sourceFile.tree,
      )
        ?.map((top) => {
          return (
            top &&
            findTestSuite(
              findTestFunctionCall(top, typeChecker),
              sourceFile,
              typeChecker,
            )
          );
        })
        .filter(Utils.notUndefined);
      return topSuites ? rootSuite(sourceFile, topSuites) : undefined;
    })
    .filter(Utils.notUndefined);
}

function rootSuite(
  sourceFile: ISourceFile,
  topSuites: TestSuite[],
): TestSuite | undefined {
  const file = sourceFile.uri.toString();
  const label = sourceFile.moduleName;
  return label
    ? <TestSuite>{
        label,
        tests: topSuites,
        file,
        position: { line: 0, character: 0 },
      }
    : undefined;
}

// export for testing
export function findTestFunctionCall(
  node: SyntaxNode,
  typeChecker: TypeChecker,
): EFunctionCallExpr | undefined {
  const letIn = findChildExpr("LetInExpr", node);
  if (letIn) {
    return findTestFunctionCall(letIn.body, typeChecker);
  }
  const call = findExpr("FunctionCallExpr", node);
  if (!call) {
    return undefined;
  }
  const t: Type = typeChecker.findType(call);

  const isTest = (t: Type): boolean =>
    t.nodeType === "Union" && t.module === "Test.Internal" && t.name === "Test";

  if (isTest(t)) {
    return call;
  }
  if (t.nodeType === "Function" && isTest(t.return)) {
    // TODO do we need this case?
    return call;
  }
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
      ? typeChecker.findImportModuleNameNodes(prefix, sourceFile)[0]?.text
      : "Test";
  return (
    qualifier !== undefined &&
    funName === `${qualifier}describe` &&
    moduleName === "Test"
  );
}

function findFirstStringArg(
  call: EFunctionCallExpr,
  typeChecker: TypeChecker,
): Expression | undefined {
  const stringArg = call.args.find((arg) => {
    const t: Type = typeChecker.findType(arg);
    return typeChecker.typeToString(t) === "String";
  });
  return stringArg;
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

  const stringArg = findFirstStringArg(call, typeChecker);
  const labelParts = findAllExprs("StringConstant", stringArg)
    ?.map((e) => e.text)
    .map((l) => stringLiteralToLabel(l));
  const position: TestSuite["position"] = {
    line: call.startPosition.row,
    character: call.startPosition.column,
  };
  const file = sourceFile.uri.toString();
  const label = labelParts?.length === 1 ? labelParts[0] : undefined;
  if (label && isTestSuite(call, sourceFile, typeChecker)) {
    const testExprs = findExpr("ListExpr", call.args[1])?.exprList;
    const tests: TestSuite[] | undefined = testExprs
      ?.map((e) => findTestFunctionCall(e, typeChecker))
      .map((call) => findTestSuite(call, sourceFile, typeChecker))
      .filter(Utils.notUndefined);
    return tests && <TestSuite>{ label, tests, file, position };
  }
  return label ? <TestSuite>{ label, file, position } : undefined;
}

type ExpressionNodeTypes = {
  ValueExpr: EValueExpr;
  StringConstant: EStringConstant;
  ListExpr: EListExpr;
  FunctionCallExpr: EFunctionCallExpr;
  LetInExpr: ELetInExpr;
};

const typeByNodeType: Map<keyof ExpressionNodeTypes, string> = new Map([
  ["ValueExpr", "value_expr"],
  ["StringConstant", "string_constant_expr"],
  ["ListExpr", "list_expr"],
  ["FunctionCallExpr", "function_call_expr"],
  ["LetInExpr", "let_in_expr"],
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
    node.type === type ? node : TreeUtils.descendantsOfType(node, type)[0];
  const e = mapSyntaxNodeToExpression(n);
  return e && mapExpr(key, e);
}

function findChildExpr<K extends keyof ExpressionNodeTypes>(
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
  const children = TreeUtils.descendantsOfType(node, type);
  const es = children?.map((n) => mapSyntaxNodeToExpression(n));
  return es?.map((e) => e && mapExpr(key, e)).flatMap((v) => (v ? [v] : []));
}

function mapExpr<K extends keyof ExpressionNodeTypes>(
  k: K,
  e: Expression,
): ExpressionNodeTypes[K] | undefined {
  return e?.nodeType === k ? (e as ExpressionNodeTypes[K]) : undefined;
}

// export for testing
export function stringLiteralToLabel(literal: string): string {
  if (literal.startsWith('"""')) {
    // without unescaping
    return literal.substring(3, literal.length - 3);
  }
  // with unescaping
  return String(JSON.parse(literal));
}
