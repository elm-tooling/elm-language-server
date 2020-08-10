/* eslint-disable @typescript-eslint/naming-convention */
import { SyntaxNode } from "web-tree-sitter";
import { TreeUtils, flatMap } from "../treeUtils";
import { IImports } from "src/imports";
import { References } from "../references";
import { IForest } from "src/forest";
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
  mapSyntaxNodeToTypeTree,
  findDefinition,
} from "./expressionTree";
import { SyntaxNodeMap } from "./syntaxNodeMap";
import { TypeExpression } from "./typeExpression";
import { IElmWorkspace } from "src/elmWorkspace";

export interface Info {
  module: string;
  name: string;
  parameters: Type[];
}

export type Type = TVar | TFunction | TUnion | TUnknown;
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
export interface TUnion {
  nodeType: "Union";
  module: string;
  name: string;
  params: Type[];
  info?: Info;
}

interface TUnknown {
  nodeType: "Unknown";
  info?: Info;
}

const TString: TUnion = {
  nodeType: "Union",
  name: "String",
  module: "Basics",
  params: [],
};

const TFloat: TUnion = {
  nodeType: "Union",
  name: "Float",
  module: "Basics",
  params: [],
};

const TNumber: TVar = { nodeType: "Var", name: "number", rigid: false };

function allTypeVars(type: Type): TVar[] {
  switch (type.nodeType) {
    case "Var":
      return [type];
    case "Union":
      return type.params.flatMap(allTypeVars);
    case "Function":
      return allTypeVars(type.return).concat(type.params.flatMap(allTypeVars));
    case "Unknown":
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
  const parentPattern = mapSyntaxNodeToTypeTree(ref.parent);

  if (parentPattern?.nodeType !== "ValueDeclaration") {
    throw new Error("Failed to get parent pattern declaration");
  }

  return parentPattern.pattern ? parentPattern : undefined;
}

export function typeToString(t: Type): string {
  switch (t.nodeType) {
    case "Unknown":
      return "Unknown";
    case "Var":
      return t.name;
    case "Function":
      return `${[...t.params, t.return]
        .map((type) => {
          return typeToString(type);
        })
        .join(" -> ")}`;
    case "Union":
      return `${t.name} ${t.params.map(typeToString).join(" ")}`;
  }
}

function typeMismatchError(
  node: SyntaxNode,
  found: Type,
  expected: Type,
): Diagnostic {
  const foundText = typeToString(found);
  const expectedText = typeToString(expected);

  const message = `Type mismatch error\nExpected: ${expectedText}\nFound: ${foundText}`;

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

export interface Diagnostic {
  node: SyntaxNode;
  message: string;
}

export interface InferenceResult {
  expressionTypes: SyntaxNodeMap<SyntaxNode, Type>;
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

  private ancestors: InferenceScope[];

  private resolvedDeclarations: SyntaxNodeMap<EValueDeclaration, Type>;

  constructor(
    private uri: string,
    private forest: IForest,
    private imports: IImports,
    private activeScopes: Set<EValueDeclaration>,
    parent?: InferenceScope,
  ) {
    this.replacements = parent?.replacements ?? new DisjointSet();
    this.ancestors = parent ? [this, parent] : [this];
    this.resolvedDeclarations =
      parent?.resolvedDeclarations ??
      new SyntaxNodeMap<EValueDeclaration, Type>();
  }

  private getBinding(e: Expression): Type | undefined {
    return this.ancestors.map((a) => a.bindings.get(e.text))[0];
  }

  // TODO: param should only be ETypeDeclaration
  public inferDeclaration(
    declaration: Expression,
    replaceExpressionTypes: boolean,
  ): InferenceResult {
    if (declaration.nodeType !== "ValueDeclaration") {
      return {
        expressionTypes: new SyntaxNodeMap<Expression, Type>(),
        diagnostics: [],
        type: { nodeType: "Unknown" },
      };
    }

    this.activeScopes.add(declaration);

    // Bind the parameters should the body can reference them
    const binding = this.bindParameters(declaration);

    // If there is a pattern, it gets infered in the parameter binding
    if (declaration.pattern) {
      return this.toTopLevelResult({ nodeType: "Unknown" });
    }

    let bodyType: Type = { nodeType: "Unknown" };
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
      }
    }

    const type: Type =
      binding.bindingType === "Annotated"
        ? (<Annotated>binding).type
        : binding.bindingType === "Unannotated"
        ? binding.count === 0
          ? bodyType
          : uncurryFunction({
              nodeType: "Function",
              params: (<Unannotated>binding).params,
              return: bodyType,
            })
        : bodyType;

    return this.toTopLevelResult(type, replaceExpressionTypes);
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

    // Remove when Node 10 is dropped
    const outerVars = (<any>this.ancestors.slice(1)).flatMap
      ? this.ancestors.slice(1).flatMap((a) => a.annotationVars)
      : flatMap(this.ancestors.slice(1), (a) => a.annotationVars);
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
    switch (e.nodeType) {
      case "ValueExpr":
        return this.inferReferenceElement(e);
      case "FunctionCallExpr":
        return this.inferFunctionCallExpr(e);
      case "BinOpExpr":
        return this.inferBinOpExpr(e);
      case "OperatorAsFunctionExpr":
        return this.inferOperatorAsFunction();
      case "NumberConstant":
        return e.isFloat ? TFloat : TNumber;
      case "StringConstant":
        return TString;
    }

    return { nodeType: "Unknown" };
  }

  private inferReferenceElement(e: Expression): Type {
    if (e.nodeType === "ValueDeclaration") {
      // return [this.inferReferencedValueDeclaration(ctx, e), {}]; // TODO: Subst should be filled
    }

    const definition = findDefinition(
      e.firstNamedChild?.firstNamedChild,
      this.uri,
      this.imports,
    );

    if (!definition) {
      return { nodeType: "Unknown" };
    }
    const binding = this.getBinding(definition.expr);

    if (binding) {
      return binding;
    }

    switch (definition.expr.nodeType) {
      case "ValueDeclaration":
        return this.inferReferencedValueDeclaration(
          definition.expr,
          definition?.uri,
        );
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
          this.imports,
        ).type;
      }
    }

    return { nodeType: "Unknown" };
  }

  private inferReferencedValueDeclaration(
    e: EValueDeclaration | undefined,
    referenceUri: string,
  ): Type {
    if (!e) {
      return { nodeType: "Unknown" };
    }

    const existing = this.resolvedDeclarations.get(e);

    if (existing) {
      return TypeReplacement.freshenVars(existing);
    }

    let type: Type | undefined;
    // Get the type annotation if there is one
    if (e.typeAnnotation) {
      type = TypeExpression.typeAnnotationInference(
        e.typeAnnotation,
        referenceUri,
        this.imports,
        false,
      )?.type;
    }

    if (!type) {
      type = new InferenceScope(
        referenceUri,
        this.forest,
        this.imports,
        this.activeScopes,
        this,
      ).inferDeclaration(e, true).type;
    }

    this.resolvedDeclarations.set(e, type);
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
      return { nodeType: "Unknown" };
    };

    if (targetType.nodeType === "Var") {
      const type: TFunction = {
        nodeType: "Function",
        params: argTypes,
        return: { nodeType: "Var", name: "a" },
      };

      if (this.isAssignable(e.target, targetType, type)) {
        return type.return;
      } else {
        return { nodeType: "Unknown" };
      }
    }

    // if (!isInferable(targetType)) {
    //   return { nodeType: "Unknown" };
    // }

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
          return { nodeType: "Unknown" };
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
      : { nodeType: "Unknown" };

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
          return { nodeType: "Unknown" };
        }

        if (
          precedence.associativity === "NON" &&
          lastPrecedence?.associativity === "NON"
        ) {
          this.diagnostics.push({
            node: e,
            message: "NonAssociativeOperatorError",
          });
          return { nodeType: "Unknown" };
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
              : { nodeType: "Unknown" };

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
    const definition = TreeUtils.findDefinitionNodeByReferencingNode(
      e,
      this.uri,
      e.tree,
      this.imports,
    );

    const definitionExpr = mapSyntaxNodeToTypeTree(definition?.node);

    const infixDeclarationExpr = mapSyntaxNodeToTypeTree(
      definitionExpr
        ? References.findOperatorInfixDeclaration(definitionExpr)
        : undefined,
    );

    if (
      definitionExpr?.nodeType !== "ValueDeclaration" ||
      infixDeclarationExpr?.nodeType !== "InfixDeclaration" ||
      !definition
    ) {
      return [{ nodeType: "Unknown" }, { precedence: 0, associativity: "NON" }];
    }

    const type = this.inferReferencedValueDeclaration(
      definitionExpr,
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
    return { nodeType: "Unknown" };
  }

  private setBinding(expr: Expression, type: Type): void {
    // TODO: Handle redefinitions

    this.bindings.set(expr.text, type);
    this.expressionTypes.set(expr, type);
  }

  private bindParameters(
    valueDeclaration: EValueDeclaration,
  ): ParameterBindingResult {
    const functionDeclarationLeft = mapSyntaxNodeToTypeTree(
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
          this.imports,
          true,
        )?.type
      : undefined;

    const patterns =
      TreeUtils.findAllNamedChildrenOfType("lower_pattern", functionDeclaration)
        ?.map(mapSyntaxNodeToTypeTree)
        .filter(notUndefined) ?? [];

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
      patterns.forEach((pat) =>
        this.bindPattern(pat, { nodeType: "Unknown" }, true),
      );
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
      : { nodeType: "Unknown" };
    this.bindPattern(pattern, bodyType, false);
  }

  private bindPattern(
    pattern: Expression,
    type: Type,
    isParameter: boolean,
  ): void {
    const ty = this.replacements.get(type);
    switch (pattern.nodeType) {
      case "Pattern":
        //this.bindPattern(pattern.firstNamedChild, ty, isParamter);
        //pattern.patternAs;
        break;
      case "LowerPattern":
        this.setBinding(pattern, type);
        break;
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

    try {
      assignable = this.assignable(type1, type2);
    } catch (e) {
      this.diagnostics.push({ node: expr, message: e });
      return false;
    }

    if (!assignable) {
      const t1 = TypeReplacement.replace(type1, this.replacements.toMap());
      const t2 = TypeReplacement.replace(type2, this.replacements.toMap());
      this.diagnostics.push(typeMismatchError(expr, t1, t2));
    }

    return assignable;
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
        return {
          nodeType: "Function",
          params: types.slice(0, types.length - 2),
          return: types[types.length - 1],
        };
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
    if (typeVar.name.startsWith("number")) {
      return (
        type.nodeType === "Union" &&
        (type.name === "Float" || type.name === "Int")
      );
    }

    return !typeVar.rigid;

    // TODO: Handle appendable, comparable, etc
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
            typeClass2 === "compappend"
              ? type2
              : { nodeType: "Var", name: "compappend", rigid: false },
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
      return { nodeType: "Var", name: val, rigid: false };
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

export function notUndefined<T>(x: T | undefined): x is T {
  return x !== undefined;
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
    return { nodeType: "Unknown" };
  }

  const mappedDeclaration = mapSyntaxNodeToTypeTree(declaration);

  if (mappedDeclaration) {
    const inferenceResult = new InferenceScope(
      uri,
      workspace.getForest(),
      workspace.getImports(),
      new Set(),
    ).inferDeclaration(mappedDeclaration, true);

    if (node.parent?.type === "function_declaration_left") {
      return inferenceResult.type;
    }

    return (
      inferenceResult.expressionTypes.get(node) ?? {
        nodeType: "Unknown",
      }
    );
  } else {
    return { nodeType: "Unknown" };
  }
}
