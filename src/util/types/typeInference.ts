/* eslint-disable @typescript-eslint/naming-convention */
import { SyntaxNode } from "web-tree-sitter";
import { TreeUtils } from "../treeUtils";
import { References } from "../references";
import {
  BinaryExprTree,
  IOperatorPrecedence,
  Operand,
  Binary,
} from "./operatorPrecedence";
import { DisjointSet } from "./disjointSet";
import { TypeReplacement } from "./typeReplacement";
import {
  Expression,
  EValueDeclaration,
  EFunctionCallExpr,
  EBinOpExpr,
  EOperator,
  EFunctionDeclarationLeft,
  EPattern,
  mapSyntaxNodeToExpression,
  findDefinition,
  EIfElseExpr,
  ELetInExpr,
  ECaseOfExpr,
  EAnonymousFunctionExpr,
  ETuplePattern,
  EListExpr,
  EUnionPattern,
  EListPattern,
} from "./expressionTree";
import { SyntaxNodeMap } from "./syntaxNodeMap";
import { TypeExpression } from "./typeExpression";
import { IElmWorkspace } from "src/elmWorkspace";
import { doesNotMatch } from "assert";
import { Sequence } from "../sequence";

export function notUndefined<T>(x: T | undefined): x is T {
  return x !== undefined;
}

export interface Info {
  module: string;
  name: string;
  parameters: Type[];
}

export type Type = TVar | TFunction | TTuple | TUnion | TUnit | TUnknown;
export interface TVar {
  nodeType: "Var";
  name: string;
  rigid?: boolean;
  info?: Info;
}
export interface TFunction {
  nodeType: "Function";
  params: Type[];
  return: Type;
  info?: Info;
}
export interface TTuple {
  nodeType: "Tuple";
  types: Type[];
  info?: Info;
}
export interface TUnion {
  nodeType: "Union";
  module: string;
  name: string;
  params: Type[];
  info?: Info;
}
export interface TRecord {
  fields: { [key: string]: Type };
  baseType?: Type;
  info?: Info;
  fieldReferences?: any;
}
export interface TMutableRecord {
  fields: { [key: string]: Type };
  baseType?: Type;
  fieldReferences?: any;
}
interface TUnit {
  nodeType: "Unit";
  info?: Info;
}
interface TUnknown {
  nodeType: "Unknown";
  info?: Info;
}

export const TUnion = (
  module: string,
  name: string,
  params: Type[],
  info?: Info,
): TUnion => {
  return { nodeType: "Union", module, name, params, info };
};

export const TVar = (name: string, rigid = false): TVar => {
  return { nodeType: "Var", name, rigid };
};

export const TFunction = (
  params: Type[],
  ret: Type,
  info?: Info,
): TFunction => {
  return { nodeType: "Function", params, return: ret, info };
};

export const TTuple = (types: Type[], info?: Info): TTuple => {
  if (types.length === 0) {
    throw new Error("Cannot create a TTuple with no types, use TUnit");
  }

  return { nodeType: "Tuple", types, info };
};

const TInt = TUnion("Basics", "Int", []);
const TFloat = TUnion("Basics", "Float", []);
const TBool = TUnion("Basics", "Bool", []);
const TString = TUnion("String", "String", []);
const TChar = TUnion("Char", "Char", []);

export const TList = (elementType: Type): TUnion =>
  TUnion("List", "List", [elementType]);

const TNumber = TVar("number");

export const TUnit: TUnit = {
  nodeType: "Unit",
};

export const TUnknown: TUnknown = {
  nodeType: "Unknown",
};

function allTypeVars(type: Type): TVar[] {
  switch (type.nodeType) {
    case "Var":
      return [type];
    case "Union":
      return type.params.flatMap(allTypeVars);
    case "Function":
      return allTypeVars(type.return).concat(type.params.flatMap(allTypeVars));
    case "Tuple":
      return type.types.flatMap(allTypeVars);
    case "Unknown":
    case "Unit":
      return [];
  }
}

function anyTypeVar(type: Type, predicate: (tvar: TVar) => boolean): boolean {
  let result = false;
  switch (type.nodeType) {
    case "Var":
      result = predicate(type);
      break;
    case "Union":
      result = type.params.some((param) => anyTypeVar(param, predicate));
      break;
    case "Function":
      result =
        anyTypeVar(type.return, predicate) ||
        type.params.some((param) => anyTypeVar(param, predicate));
      break;
    case "Unknown":
      result = false;
      break;
  }

  return (
    result ||
    type.info?.parameters.some((param) => anyTypeVar(param, predicate)) === true
  );
}

/**
 * Curry function helper
 * @param func The function type to curry
 * @param count The number params to partially apply
 */
export function curryFunction(func: TFunction, count: number): Type {
  if (count < func.params.length) {
    return {
      ...func,
      params: func.params.slice(1),
      return: func.return,
    };
  } else {
    return func.return;
  }
}

/**
 * Uncurry function helper
 * @param func The function type to uncurry
 */
export function uncurryFunction(func: TFunction): TFunction {
  if (func.return.nodeType === "Function") {
    return {
      ...func,
      params: [...func.params, ...func.return.params],
      return: func.return.return,
    };
  } else {
    return func;
  }
}

function getParentPatternDeclaration(
  ref: Expression,
): EValueDeclaration | undefined {
  const parentPattern = mapSyntaxNodeToExpression(
    TreeUtils.findParentOfType("value_declaration", ref),
  );

  if (parentPattern?.nodeType !== "ValueDeclaration") {
    throw new Error(`Failed to get parent pattern declaration`);
  }

  return parentPattern.pattern ? parentPattern : undefined;
}

export function typeToString(t: Type): string {
  switch (t.nodeType) {
    case "Unknown":
      return "Unknown";
    case "Unit":
      return "()";
    case "Var":
      return t.name;
    case "Function":
      return `${[...t.params, t.return].map(typeToString).join(" -> ")}`;
    case "Tuple":
      return `(${t.types.map(typeToString).join(", ")})`;
    case "Union":
      if (t.params.length === 0) {
        return t.name;
      } else {
        return `${t.name} ${t.params.map(typeToString).join(" ")}`;
      }
  }
}

function typeMismatchError(
  node: SyntaxNode,
  found: Type,
  expected: Type,
  patternBinding = false,
): Diagnostic {
  const foundText = typeToString(found);
  const expectedText = typeToString(expected);

  const message = patternBinding
    ? `Invalid pattern error\nExpected: ${expectedText}\nFound: ${foundText}`
    : `Type mismatch error\nExpected: ${expectedText}\nFound: ${foundText}`;

  return {
    node,
    message,
  };
}

function parameterCountError(
  node: SyntaxNode,
  actual: number,
  expected: number,
  isType = false,
): Diagnostic {
  const name = node.firstNamedChild?.text ?? "";
  return {
    node,
    message: `The ${
      isType ? "type" : "function"
    } \`${name}\` expects ${expected} argument${
      expected !== 1 ? `s` : ``
    }, but got ${actual} instead`,
  };
}

function argumentCountError(
  node: SyntaxNode,
  actual: number,
  expected: number,
  isType = false,
): Diagnostic {
  if (expected === 0 && !isType) {
    const name = node.firstNamedChild?.text;
    return {
      node,
      message: `${
        name ? `\`${name}\`` : "This value"
      } is not a function, but it was given ${actual} argument${
        actual !== 1 ? `s` : ``
      }`,
    };
  } else {
    return parameterCountError(node, actual, expected, isType);
  }
}

function redefinitionError(node: SyntaxNode): Diagnostic {
  return {
    node,
    message: `A value named \`${node.text}\` is already defined`,
  };
}

function badRecursionError(node: SyntaxNode): Diagnostic {
  return {
    node,
    message: `Infinite recursion`,
  };
}

function cyclicDefinitionError(node: SyntaxNode): Diagnostic {
  return {
    node,
    message: `Value cannot be defined in terms of itself`,
  };
}

export interface Diagnostic {
  node: SyntaxNode;
  message: string;
}

export interface InferenceResult {
  expressionTypes: SyntaxNodeMap<Expression, Type>;
  diagnostics: Diagnostic[];
  type: Type;
}

export class InferenceScope {
  private expressionTypes: SyntaxNodeMap<Expression, Type> = new SyntaxNodeMap<
    Expression,
    Type
  >();
  private diagnostics: Diagnostic[] = [];

  private bindings: Map<string, Type> = new Map<string, Type>();
  private replacements: DisjointSet;

  private annotationVars: TVar[] = [];

  public ancestors: Sequence<InferenceScope>;

  private resolvedDeclarations: SyntaxNodeMap<EValueDeclaration, Type>;

  private childDeclarations = new Set<EValueDeclaration>();

  constructor(
    private uri: string,
    private elmWorkspace: IElmWorkspace,
    private shadowableNames: Set<string>,
    private activeScopes: Set<EValueDeclaration>,
    private recursionAllowed: boolean,
    private parent?: InferenceScope,
  ) {
    this.replacements = parent?.replacements ?? new DisjointSet();

    this.resolvedDeclarations =
      parent?.resolvedDeclarations ??
      new SyntaxNodeMap<EValueDeclaration, Type>();

    this.ancestors = new Sequence(
      this,
      (scope: InferenceScope) => scope.parent,
    );
  }

  private getBinding(e: Expression): Type | undefined {
    return this.ancestors.map((a) => a.bindings.get(e.text)).find(notUndefined);
  }

  public static valueDeclarationInference(
    declaration: EValueDeclaration,
    uri: string,
    elmWorkspace: IElmWorkspace,
    activeScopes: Set<EValueDeclaration>,
  ): InferenceResult {
    // TODO: Need a good way to get all visible values
    const shadowableNames = new Set<string>();

    return new InferenceScope(
      uri,
      elmWorkspace,
      shadowableNames,
      activeScopes,
      false,
    ).inferDeclaration(declaration, true);
  }

  private inferDeclaration(
    declaration: EValueDeclaration,
    replaceExpressionTypes: boolean,
  ): InferenceResult {
    this.activeScopes.add(declaration);

    // Bind the parameters should the body can reference them
    const binding = this.bindParameters(declaration);

    // If there is a pattern, it gets infered in the parameter binding
    if (declaration.pattern) {
      return this.toTopLevelResult(TUnknown);
    }

    let bodyType: Type = TUnknown;
    if (declaration.body) {
      bodyType = this.infer(declaration.body);

      // Make sure the returned type is what is annotated
      if (binding.bindingType === "Annotated") {
        const bindingType = (<Annotated>binding).type;
        const expected =
          bindingType.nodeType === "Function"
            ? curryFunction(bindingType, binding.count)
            : bindingType;
        this.isAssignable(declaration.body, bodyType, expected);
      } else {
        this.checkTopLevelCaseBranches(declaration.body, bodyType);
      }
    }

    const type: Type =
      binding.bindingType === "Annotated"
        ? (<Annotated>binding).type
        : binding.bindingType === "Unannotated"
        ? binding.count === 0
          ? bodyType
          : uncurryFunction(TFunction((<Unannotated>binding).params, bodyType))
        : bodyType;

    return this.toTopLevelResult(type, replaceExpressionTypes);
  }

  private checkTopLevelCaseBranches(expr: Expression, exprType: Type): void {
    if (expr.nodeType === "CaseOfExpr") {
      this.isBranchesAssignable(expr, exprType, TUnknown);
    }
  }

  private checkRecursion(declaration: EValueDeclaration): boolean {
    const isRecursive = this.activeScopes.has(declaration);

    const functionDeclaration = mapSyntaxNodeToExpression(
      TreeUtils.findFirstNamedChildOfType(
        "function_declaration_left",
        declaration,
      ),
    );
    if (
      isRecursive &&
      !this.recursionAllowed &&
      (functionDeclaration?.nodeType !== "FunctionDeclarationLeft" ||
        !functionDeclaration.params[0])
    ) {
      this.diagnostics.push(badRecursionError(declaration));
    }

    return isRecursive;
  }

  private toTopLevelResult(
    type: Type,
    replaceExpressionTypes = true,
  ): InferenceResult {
    if (replaceExpressionTypes) {
      this.expressionTypes.mapValues((val) =>
        TypeReplacement.replace(val, this.replacements.toMap()),
      );
    }

    const outerVars = this.ancestors
      .toArray()
      .map((a) => a.annotationVars)
      .slice(1)
      .flat();

    const ret = TypeReplacement.replace(
      type,
      this.replacements.toMap(),
      false,
      outerVars,
    );
    return {
      expressionTypes: this.expressionTypes,
      diagnostics: this.diagnostics,
      type: ret,
    };
  }

  private infer(e: Expression): Type {
    let type: Type = TUnknown;

    switch (e.nodeType) {
      case "AnonymousFunctionExpr":
        type = this.inferLamba(e);
        break;
      case "BinOpExpr":
        type = this.inferBinOpExpr(e);
        break;
      case "CaseOfExpr":
        type = this.inferCase(e);
        break;
      case "FunctionCallExpr":
        type = this.inferFunctionCallExpr(e);
        break;
      case "IfElseExpr":
        type = this.inferIfElse(e);
        break;
      case "LetInExpr":
        type = this.inferChild((inference) => inference.letInInference(e)).type;
        break;
      case "ListExpr":
        type = this.inferList(e);
        break;
      case "NumberConstant":
        type = e.isFloat ? TFloat : TNumber;
        break;
      case "OperatorAsFunctionExpr":
        type = this.inferOperatorAsFunction();
        break;
      case "StringConstant":
        type = TString;
        break;
      case "TupleExpr":
        type = TTuple(e.exprList.map((expr) => this.infer(expr)));
        break;
      case "UnitExpr":
        type = TUnit;
        break;
      case "ValueExpr":
        type = this.inferReferenceElement(e);
        break;
      default:
        throw new Error("Unexpected Expression type");
    }

    this.expressionTypes.set(e, type);
    return type;
  }

  private lambaInference(lamba: EAnonymousFunctionExpr): InferenceResult {
    const paramVars = this.uniqueVars(lamba.params.length);
    lamba.params.forEach((p, i) => this.bindPattern(p, paramVars[i], true));

    const bodyType = this.infer(lamba.expr);
    this.checkTopLevelCaseBranches(lamba.expr, bodyType);

    return {
      expressionTypes: this.expressionTypes,
      diagnostics: this.diagnostics,
      type: uncurryFunction(TFunction(paramVars, bodyType)),
    };
  }

  private letInInference(letInExpr: ELetInExpr): InferenceResult {
    const valueDeclarations = letInExpr.valueDeclarations;
    valueDeclarations.forEach((v) => this.childDeclarations.add(v));

    valueDeclarations.forEach((declaration) => {
      if (!this.resolvedDeclarations.has(declaration)) {
        this.inferChildDeclaration(declaration);
      }
    });

    const bodyType = this.infer(letInExpr.body);
    this.checkTopLevelCaseBranches(letInExpr.body, bodyType);

    return {
      expressionTypes: this.expressionTypes,
      diagnostics: this.diagnostics,
      type: bodyType,
    };
  }

  private caseBranchInference(
    pattern: EPattern,
    caseType: Type,
    branchExpr: Expression,
  ): InferenceResult {
    this.bindPattern(pattern, caseType, false);
    const type = this.infer(branchExpr);
    return {
      expressionTypes: this.expressionTypes,
      diagnostics: this.diagnostics,
      type,
    };
  }

  private inferChild(
    callback: (inference: InferenceScope) => InferenceResult,
    activeScopes = this.activeScopes,
    recursionAllowed = this.recursionAllowed,
  ): InferenceResult {
    const result = callback(
      new InferenceScope(
        this.uri,
        this.elmWorkspace,
        this.shadowableNames,
        activeScopes,
        recursionAllowed,
        this,
      ),
    );

    this.diagnostics.push(...result.diagnostics);

    result.expressionTypes.forEach((val, key) =>
      this.expressionTypes.set(key, val),
    );

    return result;
  }

  private inferChildDeclaration(
    declaration: EValueDeclaration,
    activeScopes = this.activeScopes,
  ): InferenceResult {
    const result = this.inferChild(
      (inference) => inference.inferDeclaration(declaration, false),
      activeScopes,
    );

    this.diagnostics.push(...result.diagnostics);

    result.expressionTypes.forEach((val, key) =>
      this.expressionTypes.set(key, val),
    );

    const funcName = TreeUtils.getFunctionNameNodeFromDefinition(declaration)
      ?.text;

    if (funcName) {
      this.shadowableNames.add(funcName);
    } else {
      const pattern = declaration.pattern;

      if (pattern) {
        const patterns = TreeUtils.findAllNamedChildrenOfType(
          "lower_pattern",
          pattern,
        )
          ?.map(mapSyntaxNodeToExpression)
          .filter(notUndefined);

        patterns?.forEach((pat) => {
          const patType = result.expressionTypes.get(pat);
          if (patType) {
            this.setBinding(pat, patType);
          }
          this.shadowableNames.add(pat.text);
        });
      }
    }

    return result;
  }

  private inferList(expr: EListExpr): Type {
    const exprTypes = expr.exprList.map((e) => this.infer(e));

    for (let i = 1; i < expr.exprList.length; i++) {
      if (this.isAssignable(expr.exprList[i], exprTypes[i], exprTypes[0])) {
        this.expressionTypes.set(expr.exprList[i], exprTypes[0]);
      } else {
        break;
      }
    }

    return TList(exprTypes[0] ?? TVar("a"));
  }

  private inferIfElse(ifElseExpr: EIfElseExpr): Type {
    const exprList = ifElseExpr.exprList;

    // Check for incomplete program
    if (exprList.length < 3 || exprList.length % 2 == 0) {
      return TUnknown;
    }

    const exprTypes = exprList.map((e) => this.infer(e));

    // Check all conditions are type Bool
    for (let i = 0; i < exprList.length - 1; i += 2) {
      this.isAssignable(exprList[i], exprTypes[i], TBool);
    }

    // Check that all branches match the first one
    for (let i = 0; i < exprList.length; i++) {
      if (i != exprList.length - 1 && (i < 3 || i % 2 == 0)) {
        continue;
      }

      if (!this.isAssignable(exprList[i], exprTypes[i], exprTypes[1])) {
        break;
      }
    }

    return exprTypes[1];
  }

  private inferReferenceElement(e: Expression): Type {
    const definition = findDefinition(
      e.firstNamedChild?.lastNamedChild,
      this.uri,
      this.elmWorkspace.getImports(),
    );

    if (!definition) {
      return TUnknown;
    }

    const binding = this.getBinding(definition.expr);

    if (binding) {
      return binding;
    }

    switch (definition.expr.nodeType) {
      case "FunctionDeclarationLeft": {
        const valueDeclaration = mapSyntaxNodeToExpression(
          TreeUtils.findParentOfType("value_declaration", definition.expr),
        );

        if (valueDeclaration?.nodeType !== "ValueDeclaration") {
          throw new Error("Could not find parent value declaration");
        }
        return this.inferReferencedValueDeclaration(
          valueDeclaration,
          definition?.uri,
        );
      }
      case "LowerPattern": {
        const parentPattern = getParentPatternDeclaration(definition.expr);
        if (parentPattern) {
          this.inferReferencedValueDeclaration(parentPattern, definition?.uri);

          const binding = this.getBinding(definition.expr);

          if (binding) {
            return binding;
          } else {
            throw new Error("Failed to destructure pattern");
          }
        }

        throw new Error("Failed to bind pattern");
      }
      case "UnionVariant": {
        return TypeExpression.unionVariantInference(
          definition.expr,
          this.uri,
          this.elmWorkspace.getImports(),
        ).type;
      }

      default:
        throw new Error("Unexpected reference type");
    }
  }

  private inferReferencedValueDeclaration(
    declaration: EValueDeclaration | undefined,
    referenceUri: string,
  ): Type {
    if (!declaration) {
      return TUnknown;
    }

    const existing = this.resolvedDeclarations.get(declaration);

    if (existing) {
      return TypeReplacement.freshenVars(existing);
    }

    let type: Type | undefined;
    // Get the type annotation if there is one
    if (declaration.typeAnnotation) {
      type = TypeExpression.typeAnnotationInference(
        declaration.typeAnnotation,
        referenceUri,
        this.elmWorkspace.getImports(),
        false,
      )?.type;
    }

    if (!type) {
      const parentScope = this.ancestors.find((scope) =>
        scope.childDeclarations.has(declaration),
      );

      type = !parentScope
        ? InferenceScope.valueDeclarationInference(
            declaration,
            this.uri,
            this.elmWorkspace,
            this.activeScopes,
          ).type
        : parentScope.inferChildDeclaration(declaration, this.activeScopes)
            .type;
    }

    this.resolvedDeclarations.set(declaration, type);
    return type;
  }

  private inferFunctionCallExpr(e: EFunctionCallExpr): Type {
    const targetType = this.infer(e.target);
    const argTypes = e.args.map((arg) => this.infer(arg));

    const argCountError = (
      expr: Expression,
      endExpr: Expression,
      actual: number,
      expected: number,
    ): TUnknown => {
      this.diagnostics.push(argumentCountError(expr, actual, expected));
      return TUnknown;
    };

    if (targetType.nodeType === "Var") {
      const type = TFunction(argTypes, TVar("a"));

      if (this.isAssignable(e.target, targetType, type)) {
        return type.return;
      } else {
        return TUnknown;
      }
    }

    if (targetType.nodeType === "Unknown") {
      return TUnknown;
    }

    if (targetType.nodeType !== "Function") {
      return argCountError(e, e, e.args.length, 0);
    }

    let allAssignable = true;

    // Make sure each arg is assignable to the inferred type
    for (
      let i = 0;
      i < Math.min(e.args.length, targetType.params.length);
      i++
    ) {
      allAssignable =
        this.isAssignable(e.args[i], argTypes[i], targetType.params[i]) &&
        allAssignable;
    }

    if (allAssignable && e.args.length > targetType.params.length) {
      let appliedType = TypeReplacement.replace(
        targetType.return,
        this.replacements.toMap(),
      );

      if (appliedType.nodeType !== "Function") {
        return argCountError(e, e, e.args.length, targetType.params.length);
      }

      for (let i = targetType.params.length; i < e.args.length - 1; i++) {
        if (appliedType.nodeType !== "Function") {
          return argCountError(e.target, e.args[i], 1, 0);
        }

        if (!this.isAssignable(e.args[i], argTypes[i], appliedType.params[0])) {
          return TUnknown;
        }

        appliedType = TypeReplacement.replace(
          curryFunction(appliedType, 1),
          this.replacements.toMap(),
        );
      }

      this.expressionTypes.set(e, appliedType);
      return appliedType;
    }

    const resultType: Type = allAssignable
      ? TypeReplacement.replace(
          curryFunction(targetType, e.args.length),
          this.replacements.toMap(),
          true,
        )
      : TUnknown;

    this.expressionTypes.set(e, resultType);
    return resultType;
  }

  private inferBinOpExpr(e: EBinOpExpr): Type {
    const operatorPrecedences = new SyntaxNodeMap<
      Expression,
      IOperatorPrecedence
    >();
    const operatorTypes = new SyntaxNodeMap<Expression, TFunction>();

    let lastPrecedence: IOperatorPrecedence | undefined;

    for (const part of e.parts) {
      if (part.nodeType === "Operator") {
        const [type, precedence] = this.inferOperatorAndPrecedence(part);
        if (type.nodeType !== "Function" || type.params.length < 2) {
          return TUnknown;
        }

        if (
          precedence.associativity === "NON" &&
          lastPrecedence?.associativity === "NON"
        ) {
          this.diagnostics.push({
            node: e,
            message: "NonAssociativeOperatorError",
          });
          return TUnknown;
        }

        operatorPrecedences.set(part, precedence);
        operatorTypes.set(part, type);

        lastPrecedence = precedence;
      }
    }

    const validateTree = (
      tree: BinaryExprTree,
    ): { start: Expression; end: Expression; type: Type } => {
      switch (tree.type) {
        case "Operand": {
          const operandTree = <Operand>tree;
          const type = this.inferOperand(operandTree.operand);
          return { start: operandTree.operand, end: operandTree.operand, type };
        }
        case "Binary": {
          const binaryTree = <Binary>tree;
          const left = validateTree(binaryTree.left);
          const right = validateTree(binaryTree.right);
          const func = operatorTypes.get(binaryTree.operator);

          if (!func) {
            throw new Error("Missing function type for operator");
          }

          const leftAssignable = this.isAssignable(
            left.start,
            left.type,
            func.params[0],
            left.end,
          );
          const rightAssignable = this.isAssignable(
            right.start,
            right.type,
            func.params[1],
            right.end,
          );

          const type: Type =
            leftAssignable && rightAssignable
              ? TypeReplacement.replace(
                  curryFunction(func, 2),
                  this.replacements.toMap(),
                  true,
                )
              : TUnknown;

          return { start: left.start, end: right.end, type };
        }
      }
    };

    const result = validateTree(
      BinaryExprTree.parse(e.parts, operatorPrecedences),
    );

    this.expressionTypes.set(e, result.type);

    return result.type;
  }

  private inferOperand(e: Expression): Type {
    if (e.nodeType === "FunctionCallExpr") {
      return this.inferFunctionCallExpr(e);
    }

    return this.infer(e);
  }

  private inferOperatorAndPrecedence(
    e: EOperator,
  ): [Type, IOperatorPrecedence] {
    // Find operator reference

    const definition = findDefinition(
      e,
      this.uri,
      this.elmWorkspace.getImports(),
    );

    const opDeclaration = mapSyntaxNodeToExpression(definition?.expr.parent);

    const infixDeclarationExpr = mapSyntaxNodeToExpression(
      opDeclaration
        ? References.findOperatorInfixDeclaration(opDeclaration)
        : undefined,
    );

    if (
      opDeclaration?.nodeType !== "ValueDeclaration" ||
      infixDeclarationExpr?.nodeType !== "InfixDeclaration" ||
      !definition
    ) {
      return [TUnknown, { precedence: 0, associativity: "NON" }];
    }

    const type = this.inferReferencedValueDeclaration(
      opDeclaration,
      definition.uri,
    );

    this.expressionTypes.set(e, type);
    return [
      type,
      {
        precedence: infixDeclarationExpr.precedence,
        associativity: infixDeclarationExpr.associativity,
      },
    ];
  }

  private inferOperatorAsFunction(): Type {
    // Find referenced type
    // Handle infix
    // Infer referenced value declaration
    return TUnknown;
  }

  private inferLamba(lambaExpr: EAnonymousFunctionExpr): Type {
    return this.inferChild(
      (inference) => inference.lambaInference(lambaExpr),
      undefined,
      true,
    ).type;
  }

  private inferCase(caseOfExpr: ECaseOfExpr): Type {
    const caseOfExprType = this.infer(caseOfExpr.expr);

    let type: Type | undefined;

    caseOfExpr.branches.forEach((branch) => {
      const result = this.inferChild((inference) =>
        inference.caseBranchInference(
          branch.pattern,
          caseOfExprType,
          branch.expr,
        ),
      );

      if (!type) {
        type = result.type;
      }
    });

    return type ?? TUnknown;
  }

  private setBinding(expr: Expression, type: Type): void {
    const exprName = expr.text;
    if (this.shadowableNames.has(exprName)) {
      this.diagnostics.push(redefinitionError(expr));
    }

    this.shadowableNames.add(exprName);

    this.bindings.set(expr.text, type);
    this.expressionTypes.set(expr, type);
  }

  private bindParameters(
    valueDeclaration: EValueDeclaration,
  ): ParameterBindingResult {
    const functionDeclarationLeft = mapSyntaxNodeToExpression(
      TreeUtils.findFirstNamedChildOfType(
        "function_declaration_left",
        valueDeclaration,
      ),
    ) as EFunctionDeclarationLeft;

    if (functionDeclarationLeft) {
      return this.bindFunctionDeclarationParameters(
        valueDeclaration,
        functionDeclarationLeft,
      );
    }

    if (valueDeclaration.pattern) {
      this.bindPatternDeclarationParameters(
        valueDeclaration,
        valueDeclaration.pattern,
      );
      return { bindingType: "Other", count: 0 };
    }

    return { bindingType: "Other", count: 0 };
  }

  private bindFunctionDeclarationParameters(
    valueDeclaration: EValueDeclaration,
    functionDeclaration: EFunctionDeclarationLeft,
  ): ParameterBindingResult {
    const typeRefType = valueDeclaration.typeAnnotation
      ? TypeExpression.typeAnnotationInference(
          valueDeclaration.typeAnnotation,
          this.uri,
          this.elmWorkspace.getImports(),
          true,
        )?.type
      : undefined;

    const patterns = functionDeclaration.params;

    if (!typeRefType) {
      const params = this.uniqueVars(patterns.length);
      patterns.forEach((pat, i) => this.bindPattern(pat, params[i], true));
      return {
        bindingType: "Unannotated",
        params,
        count: params.length,
      } as Unannotated;
    }

    const maxParams =
      typeRefType.nodeType === "Function" ? typeRefType.params.length : 0;

    if (patterns.length > maxParams) {
      this.diagnostics.push(
        parameterCountError(functionDeclaration, patterns.length, maxParams),
      );
      patterns.forEach((pat) => this.bindPattern(pat, TUnknown, true));
      return { count: maxParams } as Other;
    }

    if (typeRefType.nodeType === "Function") {
      patterns.forEach((pat, i) =>
        this.bindPattern(pat, typeRefType.params[i], true),
      );
    }

    this.annotationVars = allTypeVars(typeRefType);

    return {
      bindingType: "Annotated",
      type: typeRefType,
      count: patterns.length,
    } as Annotated;
  }

  private bindPatternDeclarationParameters(
    valueDeclaration: EValueDeclaration,
    pattern: EPattern,
  ): void {
    const declaredNames = pattern.descendantsOfType("lower_pattern");
    const bodyType: Type = valueDeclaration.body
      ? this.infer(valueDeclaration.body)
      : TUnknown;
    this.bindPattern(pattern, bodyType, false);
  }

  private bindPattern(
    pattern: Expression,
    type: Type,
    isParameter: boolean,
  ): void {
    const ty = this.replacements.get(type) ?? type;
    switch (pattern.nodeType) {
      case "AnythingPattern":
        break;
      case "Pattern":
        {
          const child = mapSyntaxNodeToExpression(pattern.firstNamedChild);
          if (!child) {
            throw new Error("Missing pattern child");
          }

          this.bindPattern(child, ty, isParameter);
          if (pattern.patternAs) {
            this.bindPattern(pattern.patternAs, ty, isParameter);
          }
        }
        break;
      case "LowerPattern":
        this.setBinding(pattern, ty);
        break;
      case "ListPattern":
        if (isParameter) {
          this.bindListPattern(pattern, TUnknown);
        } else {
          this.bindListPattern(pattern, ty);
        }
        break;
      case "TuplePattern":
        this.bindTuplePattern(pattern, ty, isParameter);
        break;
      case "UnionPattern":
        this.bindUnionPattern(pattern, type, isParameter);
        break;
      case "UnitExpr":
        this.isAssignable(pattern, ty, TUnit, undefined, true);
        break;
      default:
        throw new Error("Unexpected pattern type: " + pattern.nodeType);
    }
  }

  private bindTuplePattern(
    tuplePattern: ETuplePattern,
    type: Type,
    isParameter: boolean,
  ): void {
    const patterns = tuplePattern.patterns;
    const ty = this.bindIfVar(
      tuplePattern,
      type,
      TTuple(this.uniqueVars(patterns.length)),
    );

    if (ty.nodeType !== "Tuple" || ty.types.length !== patterns.length) {
      patterns.forEach((pat) => this.bindPattern(pat, TUnknown, isParameter));

      if (ty.nodeType !== "Unknown") {
        const actualType = TTuple(this.uniqueVars(patterns.length));
        this.diagnostics.push(
          typeMismatchError(tuplePattern, actualType, ty, true),
        );
      }
      return;
    }

    patterns.forEach((pat, i) => {
      this.bindPattern(pat, ty.types[i], isParameter);
    });
  }

  private bindUnionPattern(
    unionPattern: EUnionPattern,
    type: Type,
    isParameter: boolean,
  ): void {
    const variant = findDefinition(
      unionPattern.constructor.firstNamedChild,
      this.uri,
      this.elmWorkspace.getImports(),
    );

    if (variant?.expr.nodeType !== "UnionVariant") {
      throw new Error("Could not find UnionVariant for " + unionPattern.text);
    }

    const variantType = TypeExpression.unionVariantInference(
      variant.expr,
      variant.uri,
      this.elmWorkspace.getImports(),
    ).type;

    if (!variantType || variantType.nodeType === "Unknown") {
      unionPattern.namedParams.forEach((p) => this.setBinding(p, TUnknown));
      return;
    }

    const issueError = (actual: number, expected: number): void => {
      this.diagnostics.push(
        argumentCountError(unionPattern, actual, expected, true),
      );
      unionPattern.namedParams.forEach((p) => this.setBinding(p, TUnknown));
    };

    if (variantType.nodeType === "Function") {
      const ty = this.bindIfVar(unionPattern, type, variantType.return);
      if (this.isAssignable(unionPattern, ty, variantType.return)) {
        if (unionPattern.argPatterns.length !== variantType.params.length) {
          issueError(
            unionPattern.argPatterns.length,
            variantType.params.length,
          );
        } else {
          unionPattern.argPatterns.forEach((p, i) => {
            this.bindPattern(p, variantType.params[i], isParameter);
          });
        }
      } else {
        unionPattern.namedParams.forEach((p) => this.setBinding(p, TUnknown));
      }
    } else {
      const ty = this.bindIfVar(unionPattern, type, variantType);
      if (
        this.isAssignable(unionPattern, ty, variantType) &&
        unionPattern.argPatterns.length > 0
      ) {
        issueError(unionPattern.argPatterns.length, 0);
      } else {
        unionPattern.namedParams.forEach((p) => this.setBinding(p, TUnknown));
      }
    }
  }

  // private bindConsPattern(consPattern: EConsPattern, type: Type): void {
  //   this.bindListPatternParts(consPattern, consPattern.parts, type, true);
  // }

  private bindListPattern(listPattern: EListPattern, type: Type): void {
    this.bindListPatternParts(listPattern, listPattern.parts, type, true);
  }

  private bindListPatternParts(
    listPattern: EListPattern,
    parts: Expression[],
    type: Type,
    isCons: boolean,
  ): void {
    const ty = this.bindIfVar(listPattern, type, TList(TVar("a")));

    if (ty.nodeType !== "Union" || ty.name !== "List") {
      if (ty.nodeType !== "Unknown") {
        this.diagnostics.push(
          typeMismatchError(listPattern, TList(TVar("a")), ty, true),
        );
      }

      parts.forEach((p) => this.bindPattern(p, TUnknown, false));
      return;
    }

    const innerType = ty.params[0];

    parts.slice(0, parts.length - 1).forEach((part) => {
      const t = part.nodeType === "ListPattern" ? ty : innerType;
      this.bindPattern(part, t, false);
    });

    if (parts.length > 0) {
      this.bindPattern(parts[parts.length - 1], isCons ? ty : innerType, false);
    }
  }

  private isAssignable(
    expr: Expression,
    type1: Type,
    type2: Type,
    endElement?: Expression,
    patternBinding = false,
  ): boolean {
    let assignable: boolean;

    if (expr.nodeType === "CaseOfExpr") {
      return this.isBranchesAssignable(expr, type1, type2);
    }

    try {
      assignable = this.assignable(type1, type2);
    } catch (e) {
      this.diagnostics.push({ node: expr, message: e });
      return false;
    }

    if (!assignable) {
      const t1 = TypeReplacement.replace(type1, this.replacements.toMap());
      const t2 = TypeReplacement.replace(type2, this.replacements.toMap());

      const errorExpr = expr.nodeType === "LetInExpr" ? expr.body : expr;
      this.diagnostics.push(
        typeMismatchError(errorExpr, t1, t2, patternBinding),
      );
    }

    return assignable;
  }

  private isBranchesAssignable(
    expr: ECaseOfExpr,
    type1: Type,
    type2: Type,
  ): boolean {
    // If type2 is not a concrete type, then every branch should match the first type
    const t2 =
      type2.nodeType !== "Unknown" && type2.nodeType !== "Var" ? type2 : type1;

    return expr.branches.every((branch) => {
      const t1 = this.expressionTypes.get(branch.expr);
      return t1 ? this.isAssignable(branch.expr, t1, t2) : false;
    });
  }

  private assignable(type1: Type, type2: Type): boolean {
    const ty1 = this.replacements.get(type1);
    const ty2 = this.replacements.get(type2);

    let result =
      ty1 === ty2 || ty1?.nodeType === "Unknown" || ty2?.nodeType === "Unknown";

    if (!result) {
      if (ty1 && ty2 && ty1.nodeType !== "Var" && ty2.nodeType === "Var") {
        result = this.nonVarAssignableToVar(ty1, ty2);
      } else {
        switch (ty1?.nodeType) {
          case "Var":
            if (ty2?.nodeType === "Var") {
              result = this.varsAssignable(ty1, ty2);
            } else if (ty2) {
              result = this.nonVarAssignableToVar(ty2, ty1);
            }
            break;
          case "Union":
            {
              result =
                ty2?.nodeType === "Union" &&
                ty1.name === ty2.name &&
                ty1.module === ty2.module &&
                this.allAssignable(ty1.params, ty2.params);
            }
            break;
          case "Function":
            {
              result =
                ty2?.nodeType === "Function" &&
                this.functionAssignable(ty1, ty2);
            }
            break;
          case "Tuple":
            {
              result =
                ty2?.nodeType === "Tuple" &&
                ty1.types.length === ty2.types.length &&
                this.allAssignable(ty1.types, ty2.types);
            }
            break;
          case "Unknown":
            result = true;
        }
      }
    }

    if (result && ty1 && ty2) {
      this.trackReplacement(ty1, ty2);
    }
    return result;
  }

  private allAssignable(type1: Type[], type2: Type[]): boolean {
    return (
      type1.length === type2.length &&
      type1.every((t, i) => this.assignable(t, type2[i]))
    );
  }

  private functionAssignable(type1: TFunction, type2: TFunction): boolean {
    const allTypes1 = type1.params.concat(type1.return);
    const allTypes2 = type2.params.concat(type2.return);

    // If there is only one type, return it
    // If there are multiple, curry it into a new function
    function makeFunction(types: Type[]): Type {
      if (types.length === 1) {
        return types[0];
      } else {
        return TFunction(
          types.slice(0, types.length - 2),
          types[types.length - 1],
        );
      }
    }

    const paramsSize = Math.min(allTypes1.length, allTypes2.length) - 1;

    // Make sure the shared parameters are assignable
    const sharedAssignable = this.allAssignable(
      allTypes1.slice(0, paramsSize),
      allTypes2.slice(0, paramsSize),
    );

    const tailAssignable = this.assignable(
      makeFunction(allTypes1.slice(paramsSize)),
      makeFunction(allTypes2.slice(paramsSize)),
    );

    return sharedAssignable && tailAssignable;
  }

  /**
   * Check that two type vars can be unified
   */
  private varsAssignable(type1: TVar, type2: TVar): boolean {
    const typeClass1 = getTypeclassName(type1);
    const typeClass2 = getTypeclassName(type2);

    if (!type1.rigid && !typeClass1) {
      return true;
    } else if (!type1.rigid && typeClass1) {
      return (
        this.typeclassesCompatable(typeClass1, typeClass2, !type2.rigid) ||
        (!type2.rigid &&
          this.typeclassesConstrainToCompappend(typeClass1, typeClass2))
      );
    } else if (type1.rigid && !typeClass1) {
      return !type2.rigid && !typeClass2;
    } else if (type1.rigid && typeClass1 && type2.rigid) {
      // If they are both rigid and we have a type class, they must be the same typeclass
      return typeClass1 === typeClass2;
    } else if (type1.rigid && typeClass1 && !type2.rigid) {
      return this.typeclassesCompatable(typeClass1, typeClass2, !type2.rigid);
    } else {
      throw new Error("Impossible");
    }
  }

  private nonVarAssignableToVar(type: Type, typeVar: TVar): boolean {
    const allAssignableTo = (types: Type[], typeClass: string): boolean => {
      return types.every((t) => this.assignable(t, TVar(typeClass)));
    };

    if (typeVar.name.startsWith("number")) {
      return (
        type.nodeType === "Union" &&
        (type.name === "Float" || type.name === "Int")
      );
    } else if (typeVar.name.startsWith("appendable")) {
      return (
        type.nodeType === "Union" &&
        (type.name === "String" || type.name === "List")
      );
    } else if (typeVar.name.startsWith("comparable")) {
      if (type.nodeType === "Tuple") {
        return allAssignableTo(type.types, "comparable");
      } else if (type.nodeType === "Union") {
        return (
          type.name === "Float" ||
          type.name === "Int" ||
          type.name === "Char" ||
          type.name === "String" ||
          (type.name === "List" &&
            (allAssignableTo(type.params, "comparable") ||
              allAssignableTo(type.params, "number")))
        );
      } else {
        return false;
      }
    } else if (typeVar.name.startsWith("compappend")) {
      return (
        type.nodeType === "Union" &&
        (type.name === "String" ||
          (type.name === "List" &&
            (allAssignableTo(type.params, "comparable") ||
              allAssignableTo(type.params, "compappend"))))
      );
    }

    return !typeVar.rigid;
  }

  private typeclassesCompatable(
    name1: string,
    name2?: string,
    unconstrainedAllowed = true,
  ): boolean {
    if (!name2) {
      return unconstrainedAllowed;
    }
    if (name1 === name2) {
      return true;
    }
    if (name1 === "number" && name2 === "comparable") {
      return true;
    }
    if (name1 === "comparable" && name2 === "number") {
      return true;
    }
    if (
      name1 === "comparable" &&
      (name2 === "number" || name2 === "compappend")
    ) {
      return true;
    }
    if (
      name1 === "compappend" &&
      (name2 === "comparable" || name2 === "appendable")
    ) {
      return true;
    }
    return false;
  }

  private typeclassesConstrainToCompappend(
    tc1?: string,
    tc2?: string,
  ): boolean {
    if (tc1 === "comparable") {
      return tc2 === "appendable" || tc2 === "compappend";
    }
    if (tc1 === "appendable") {
      return tc2 === "comparable" || tc2 === "compappend";
    }
    return false;
  }

  private trackReplacement(type1: Type, type2: Type): void {
    if (type1 === type2) {
      return;
    }

    // Assign k to be of type v
    const assign = (typeVar: TVar, type: Type): void => {
      if (anyTypeVar(type, (tVar) => tVar === typeVar)) {
        throw Error("InfiniteTypeException");
      }
      this.replacements.set(typeVar, type);
    };

    // If we assign anything to a var, the type is constrained to that var
    if (
      type2.nodeType === "Var" &&
      (!this.replacements.contains(type2) ||
        (type1.nodeType !== "Var" &&
          this.replacements.get(type2)?.nodeType === "Var"))
    ) {
      if (type1.nodeType === "Var") {
        const typeClass1 = getTypeclassName(type1);
        const typeClass2 = getTypeclassName(type2);

        if (!typeClass1 && typeClass2) {
          // Assigning a => number, a should be constrained to number
          assign(type1, type2);
        } else if (
          !type1.rigid &&
          !type2.rigid &&
          this.typeclassesConstrainToCompappend(typeClass1, typeClass2)
        ) {
          assign(
            type1,
            typeClass2 === "compappend" ? type2 : TVar("compappend"),
          );
        } else if (
          !type1.rigid &&
          !type2.rigid &&
          typeClass1 === "comparable" &&
          typeClass2 === "number"
        ) {
          // comparable is constrained to number
          assign(type1, type2);
        } else if (!type1.rigid && type2.rigid) {
          // Assigning a flex var to a rigid var makes it rigid
          assign(type1, type2);
        } else {
          assign(type2, type1);
        }
      } else {
        // Int => number contrains number to be an Int
        assign(type2, type1);
      }
    }

    // Assigning a var to a non var type constrains the type
    if (
      type1.nodeType === "Var" &&
      type2.nodeType !== "Var" &&
      !this.replacements.contains(type1)
    ) {
      // TODO: Handle extension records
      assign(type1, type2);
    }
  }

  private bindIfVar(e: Expression, type: Type, defaultType: Type): Type {
    if (
      type.nodeType === "Var" &&
      this.isAssignable(e, type, defaultType, undefined, true)
    ) {
      return defaultType;
    } else {
      return type;
    }
  }

  private uniqueVars(count: number): TVar[] {
    return getVarNames(count).map((val) => {
      return TVar(val);
    });
  }
}

function getTypeclassName(type: TVar): string | undefined {
  switch (type.name) {
    case "number":
    case "appendable":
    case "comparable":
    case "compappend":
      return type.name;
  }
}

function getVarNames(count: number): string[] {
  const names = [];
  for (let i = 0; i < count; i++) {
    const letter = VAR_LETTERS[i % 26];
    if (i < 26) {
      names.push(letter);
    } else {
      names.push(`${letter}${i / 26}`);
    }
  }
  return names;
}

const VAR_LETTERS = "abcdefghijklmnopqrstuvwxyz";

type BindingType = "Annotated" | "Unannotated" | "Other";
interface ParameterBindingResult {
  bindingType: BindingType;
  count: number;
}

interface Annotated extends ParameterBindingResult {
  bindingType: "Annotated";
  type: Type;
}
interface Unannotated extends ParameterBindingResult {
  bindingType: "Unannotated";
  params: Type[];
}
interface Other extends ParameterBindingResult {
  bindingType: "Other";
}

export function findType(
  node: SyntaxNode,
  uri: string,
  workspace: IElmWorkspace,
): Type {
  let declaration: SyntaxNode | null = node;
  while (
    declaration &&
    declaration.type !== "file" &&
    declaration.type !== "value_declaration" &&
    declaration.parent?.type !== "file"
  ) {
    declaration = declaration.parent;
  }

  // We can't find the top level declaration
  if (
    declaration?.type !== "value_declaration" ||
    declaration.parent?.type !== "file"
  ) {
    return TUnknown;
  }

  const mappedDeclaration = mapSyntaxNodeToExpression(declaration);

  if (mappedDeclaration && mappedDeclaration.nodeType === "ValueDeclaration") {
    const inferenceResult = InferenceScope.valueDeclarationInference(
      mappedDeclaration,
      uri,
      workspace,
      new Set<EValueDeclaration>(),
    );

    if (node.parent?.type === "function_declaration_left") {
      return inferenceResult.type;
    }

    const mappedNode = mapSyntaxNodeToExpression(node);

    const findTypeOrParentType = (
      expr: Expression | undefined,
    ): Type | undefined => {
      const found = expr
        ? inferenceResult.expressionTypes.get(expr)
        : undefined;

      if (found) {
        return found;
      }

      // Check if the parent is the same text and position
      if (
        expr?.text === expr?.parent?.text &&
        expr?.startIndex === expr?.parent?.startIndex &&
        expr?.endIndex === expr?.parent?.endIndex
      ) {
        return findTypeOrParentType(mapSyntaxNodeToExpression(expr?.parent));
      }
    };

    return findTypeOrParentType(mappedNode) ?? TUnknown;
  } else {
    return TUnknown;
  }
}

// Testing helper
function printAllExpressionTypes(
  rootNode: SyntaxNode,
  expressionTypes: SyntaxNodeMap<Expression, Type>,
): void {
  function findNode(
    node: SyntaxNode,
    expr: Expression,
  ): SyntaxNode | undefined {
    if ((node as any).id === (expr as any).id) {
      return node;
    }

    return node.namedChildren
      .map((n) => findNode(n, expr))
      .filter(notUndefined)[0];
  }

  expressionTypes.forEach((val, key) => {
    const node = findNode(rootNode, key);
    console.log(`${node?.text} - ${node?.type}: ${typeToString(val)}`);
  });
}
