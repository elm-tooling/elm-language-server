import { IImports } from "src/imports";
import {
  Type,
  TVar,
  uncurryFunction,
  InferenceResult,
  Diagnostic,
  TUnit,
  TUnknown,
  TFunction,
  TTuple,
  TUnion,
  TList,
} from "./typeInference";
import {
  Expression,
  ETypeExpression,
  ETypeDeclaration,
  ETypeRef,
  ETypeVariable,
  mapSyntaxNodeToExpression,
  ETypeAnnotation,
  findDefinition,
  EUnionVariant,
} from "./expressionTree";
import { TreeUtils } from "../treeUtils";
import { TypeReplacement } from "./typeReplacement";
import { SyntaxNodeMap } from "./syntaxNodeMap";
import { Utils } from "../utils";

export class TypeExpression {
  // All the type variables we've seen
  private varsByExpression: SyntaxNodeMap<Expression, TVar> = new SyntaxNodeMap<
    Expression,
    TVar
  >();

  private expressionTypes: SyntaxNodeMap<Expression, Type> = new SyntaxNodeMap<
    Expression,
    Type
  >();

  private diagnostics: Diagnostic[] = [];

  constructor(
    private root: Expression,
    private uri: string,
    private imports: IImports,
    private rigidVars: boolean,
  ) {}

  public static typeDeclarationInference(
    e: ETypeDeclaration,
    uri: string,
    imports: IImports,
  ): InferenceResult {
    const inferenceResult = new TypeExpression(
      e,
      uri,
      imports,
      false,
    ).inferTypeDeclaration(e);

    return {
      ...inferenceResult,
      type: TypeReplacement.freshenVars(inferenceResult.type),
    };
  }

  public static typeAnnotationInference(
    e: ETypeAnnotation,
    uri: string,
    imports: IImports,
    rigid = true,
  ): InferenceResult | undefined {
    if (!e.typeExpression) {
      return;
    }

    const inferenceResult = new TypeExpression(
      e,
      uri,
      imports,
      true,
    ).inferTypeExpression(e.typeExpression);

    let type = TypeReplacement.replace(inferenceResult.type, new Map());

    if (!rigid) {
      type = TypeReplacement.flexify(type);
    }

    return { ...inferenceResult, type };
  }

  public static unionVariantInference(
    e: EUnionVariant,
    uri: string,
    imports: IImports,
  ): InferenceResult {
    const inferenceResult = new TypeExpression(
      e,
      uri,
      imports,
      false,
    ).inferUnionConstructor(e);

    return {
      ...inferenceResult,
      type: TypeReplacement.freshenVars(inferenceResult.type),
    };
  }

  private inferTypeDeclaration(
    typeDeclaration: ETypeDeclaration,
  ): InferenceResult {
    return this.toResult(this.typeDeclarationType(typeDeclaration));
  }

  private inferTypeExpression(typeExpr: ETypeExpression): InferenceResult {
    return this.toResult(this.typeExpressionType(typeExpr));
  }

  private inferUnionConstructor(unionVariant: EUnionVariant): InferenceResult {
    const declaration = mapSyntaxNodeToExpression(
      TreeUtils.findParentOfType("type_declaration", unionVariant),
    );

    const declarationType: Type =
      declaration && declaration.nodeType === "TypeDeclaration"
        ? this.typeDeclarationType(declaration)
        : TUnknown;

    const params = unionVariant.params.map((t) =>
      this.typeSignatureSegmentType(t),
    );

    const type: Type =
      params.length > 0 ? TFunction(params, declarationType) : declarationType;

    return this.toResult(type);
  }

  private typeExpressionType(typeExpr: ETypeExpression): Type {
    const segmentTypes = typeExpr.segments.map((s) =>
      this.typeSignatureSegmentType(s),
    );
    if (segmentTypes.length === 1) {
      return segmentTypes[0];
    } else {
      return uncurryFunction(
        TFunction(
          segmentTypes.slice(0, segmentTypes.length - 1),
          segmentTypes[segmentTypes.length - 1],
        ),
      );
    }
  }

  private toResult(type: Type): InferenceResult {
    return {
      type,
      expressionTypes: this.expressionTypes,
      diagnostics: this.diagnostics,
    };
  }

  private typeSignatureSegmentType(segment: Expression): Type {
    switch (segment.nodeType) {
      case "TypeRef":
        return this.typeRefType(segment);
      case "TypeVariable":
        return this.typeVariableType(segment);
      case "TypeExpression":
        return this.typeExpressionType(segment);
      case "TupleType":
        return segment.unitExpr
          ? TUnit
          : TTuple(
              segment.typeExpressions.map((t) => this.typeExpressionType(t)),
            );
    }

    return TUnknown;
  }

  private typeVariableType(typeVariable: ETypeVariable): Type {
    const definition = findDefinition(
      typeVariable.firstNamedChild,
      this.uri,
      this.imports,
    );

    // The type variable doesn't reference anything
    if (!definition || (<any>definition.expr).id === (<any>typeVariable).id) {
      const type = this.getTypeVar(typeVariable);
      this.expressionTypes.set(typeVariable, type);
      return type;
    }

    const cached = this.varsByExpression.get(definition.expr);

    if (cached) {
      return cached;
    }

    const annotation = mapSyntaxNodeToExpression(
      TreeUtils.getAllAncestorsOfType("type_annotation", definition.expr)[0],
    );

    const expr = annotation
      ? TreeUtils.findFirstNamedChildOfType("type_expression", annotation)
      : undefined;

    // If the definition is not in a type annotation or it is to a
    // variable in the same annotation, use the type of the reference
    if (!annotation || !expr || (<any>expr).id === (<any>this.root).id) {
      const type = this.getTypeVar(definition.expr);
      this.varsByExpression.set(typeVariable, type);
      this.expressionTypes.set(typeVariable, type);
      return type;
    }

    // If the definition is to a variable declared in a parent annotation,
    // use the type from that annotation's inference
    const type =
      TypeExpression.typeAnnotationInference(
        annotation as ETypeAnnotation,
        definition.uri,
        this.imports,
        true,
      )?.expressionTypes.get(definition.expr) ?? TUnknown;

    if (type.nodeType === "Var") {
      this.varsByExpression.set(definition.expr, type);
    }

    this.expressionTypes.set(typeVariable, type);
    return type;
  }

  private typeRefType(typeRef: ETypeRef): Type {
    const args =
      TreeUtils.findAllNamedChildrenOfType("type_variable", typeRef)
        ?.map(mapSyntaxNodeToExpression)
        .filter(Utils.notUndefined.bind(this))
        .map((arg) => this.typeSignatureSegmentType(arg)) ?? [];

    const definition = findDefinition(
      typeRef.firstNamedChild?.firstNamedChild,
      this.uri,
      this.imports,
    );

    let declaredType: Type = TUnknown;
    if (definition) {
      switch (definition.expr.nodeType) {
        case "TypeDeclaration":
          declaredType = TypeExpression.typeDeclarationInference(
            definition.expr,
            definition.uri,
            this.imports,
          ).type;
          break;

        default:
          throw new Error("Unexpected type reference");
      }
    } else {
      if (typeRef.firstNamedChild?.firstNamedChild?.text === "List") {
        declaredType = TList(TVar("a"));
      }
    }

    const params = declaredType?.info
      ? declaredType.info.parameters
      : declaredType?.nodeType === "Union"
      ? declaredType.params
      : [];

    if (params.length === 0) {
      return declaredType;
    }

    // The param types are always TVars
    return TypeReplacement.replace(
      declaredType,
      new Map(params.map((p, i) => [<TVar>p, args[i]])),
    );
  }

  private typeDeclarationType(typeDeclaration: ETypeDeclaration): Type {
    const params: TVar[] = typeDeclaration.typeNames.map((name) =>
      this.getTypeVar(name),
    );

    return TUnion(typeDeclaration.moduleName, typeDeclaration.name, params);
  }

  private getTypeVar(e: Expression): TVar {
    const tVar = TVar(e.text, this.rigidVars);
    this.varsByExpression.set(e, tVar);
    return tVar;
  }
}
