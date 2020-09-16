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
  TRecord,
  Info,
  typeArgumentCountError,
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
  ERecordType,
  ETypeAliasDeclaration,
} from "./expressionTree";
import { TreeUtils } from "../treeUtils";
import { TypeReplacement } from "./typeReplacement";
import { SyntaxNodeMap } from "./syntaxNodeMap";
import { Utils } from "../utils";
import { RecordFieldReferenceTable } from "./recordFieldReferenceTable";

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
    private activeAliases: Set<ETypeAliasDeclaration> = new Set(),
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

    TypeReplacement.freeze(inferenceResult.type);

    return {
      ...inferenceResult,
      type: TypeReplacement.freshenVars(inferenceResult.type),
    };
  }
  public static typeAliasDeclarationInference(
    e: ETypeAliasDeclaration,
    uri: string,
    imports: IImports,
    activeAliases = new Set<ETypeAliasDeclaration>(),
  ): InferenceResult {
    const inferenceResult = new TypeExpression(
      e,
      uri,
      imports,
      false,
      activeAliases,
    ).inferTypeAliasDeclaration(e);

    TypeReplacement.freeze(inferenceResult.type);

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
    TypeReplacement.freeze(inferenceResult.type);

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

  private inferTypeAliasDeclaration(
    declaration: ETypeAliasDeclaration,
  ): InferenceResult {
    if (this.activeAliases.has(declaration)) {
      this.diagnostics.push({
        node: declaration,
        endNode: declaration,
        message: "BadRecursionError",
      });
      return this.toResult(TUnknown);
    }

    this.activeAliases.add(declaration);

    const type = declaration.typeExpression
      ? this.typeExpressionType(declaration.typeExpression)
      : TUnknown;

    const params = declaration.typeVariables.map(this.getTypeVar.bind(this));
    const moduleName =
      TreeUtils.getModuleNameNode(declaration.tree)?.text ?? "";
    const info: Info = {
      module: moduleName,
      name: declaration.name.text,
      parameters: params,
    };
    return this.toResult({ ...type, info });
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
    let type: Type = TUnknown;

    switch (segment.nodeType) {
      case "TypeRef":
        type = this.typeRefType(segment);
        break;
      case "TypeVariable":
        type = this.typeVariableType(segment);
        break;
      case "TypeExpression":
        type = this.typeExpressionType(segment);
        break;
      case "TupleType":
        type = segment.unitExpr
          ? TUnit
          : TTuple(
              segment.typeExpressions.map((t) => this.typeExpressionType(t)),
            );
        break;
      case "RecordType":
        type = this.recordTypeDeclarationType(segment);
        break;
    }

    return type;
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
    if (!annotation || !expr || (<any>annotation).id === (<any>this.root).id) {
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

  private recordTypeDeclarationType(record: ERecordType): TRecord {
    const fieldExpressions = record.fieldTypes;
    if (!fieldExpressions || fieldExpressions.length === 0) {
      return TRecord({});
    }

    const fieldTypes: { [key: string]: Type } = {};
    fieldExpressions.forEach((field) => {
      fieldTypes[field.name] = this.typeExpressionType(field.typeExpression);
    });

    const fieldRefs = RecordFieldReferenceTable.fromExpressions(
      fieldExpressions,
    );

    const baseTypeDefinition = findDefinition(
      record.baseType,
      this.uri,
      this.imports,
    )?.expr;

    const baseType = baseTypeDefinition
      ? this.getTypeVar(baseTypeDefinition)
      : record.baseType
      ? TVar(record.baseType.text)
      : undefined;

    return TRecord(fieldTypes, baseType, undefined, fieldRefs);
  }

  private typeRefType(typeRef: ETypeRef): Type {
    const args =
      TreeUtils.findAllNamedChildrenOfType(
        [
          "type_variable",
          "type_ref",
          "tuple_type",
          "record_type",
          "type_expression",
        ],
        typeRef,
      )
        ?.map(mapSyntaxNodeToExpression)
        .filter(Utils.notUndefined.bind(this))
        .map((arg) => this.typeSignatureSegmentType(arg)) ?? [];

    const definition = findDefinition(
      typeRef.firstNamedChild?.lastNamedChild,
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
        case "TypeAliasDeclaration":
          declaredType = TypeExpression.typeAliasDeclarationInference(
            definition.expr,
            definition.uri,
            this.imports,
            new Set(this.activeAliases.values()),
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

    if (declaredType.nodeType !== "Unknown" && params.length !== args.length) {
      this.diagnostics.push(
        typeArgumentCountError(typeRef, args.length, params.length),
      );
      return TUnknown;
    }

    if (params.length === 0) {
      return declaredType;
    }

    // The param types are always TVars
    return TypeReplacement.replace(
      declaredType,
      new Map(
        params
          .map<[TVar, Type]>((p, i) => [<TVar>p, args[i]])
          .filter(([, type]) => !!type),
      ),
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
