import { SyntaxNode } from "web-tree-sitter";
import { OperatorAssociativity } from "../operatorPrecedence";
import { TreeUtils } from "../../util/treeUtils";
import { Utils } from "../../util/utils";
import { IProgram } from "../program";
import { performance } from "perf_hooks";
import { Diagnostic } from "../diagnostics";
/* eslint-disable @typescript-eslint/naming-convention */

export let definitionTime = 0;
export let mappingTime = 0;

export function resetDefinitionAndMappingTime(): void {
  definitionTime = 0;
  mappingTime = 0;
}

export type Expression =
  | EAnonymousFunctionExpr
  | EAnythingPattern
  | EBinOpExpr
  | ECaseOfBranch
  | ECaseOfExpr
  | ECharConstantExpr
  | EConsPattern
  | EField
  | EFieldAccessExpr
  | EFieldAccessorFunctionExpr
  | EFieldType
  | EFunctionCallExpr
  | EFunctionDeclarationLeft
  | EGlslCodeExpr
  | EIfElseExpr
  | EInfixDeclaration
  | ELetInExpr
  | EListExpr
  | EListPattern
  | ELowerPattern
  | ELowerTypeName
  | ENegateExpr
  | ENumberConstant
  | ENullaryConstructorArgumentPattern
  | EOperator
  | EOperatorAsFunctionExpr
  | EPattern
  | EPortAnnotation
  | ERecordExpr
  | ERecordType
  | ERecordPattern
  | EStringConstant
  | ETupleExpr
  | ETuplePattern
  | ETupleType
  | ETypeAliasDeclaration
  | ETypeAnnotation
  | ETypeDeclaration
  | ETypeExpression
  | ETypeRef
  | ETypeVariable
  | EUnionPattern
  | EUnionVariant
  | EUnitExpr
  | EValueDeclaration
  | EValueExpr;

export interface EValueDeclaration extends SyntaxNode {
  nodeType: "ValueDeclaration";
  params: string[];
  body?: SyntaxNode;
  typeAnnotation?: SyntaxNode;
  pattern?: SyntaxNode;
}
export interface EFunctionCallExpr extends SyntaxNode {
  nodeType: "FunctionCallExpr";
  target: Expression;
  args: Expression[];
}
export interface EIfElseExpr extends SyntaxNode {
  nodeType: "IfElseExpr";
  exprList: Expression[];
}
export interface ELetInExpr extends SyntaxNode {
  nodeType: "LetInExpr";
  valueDeclarations: EValueDeclaration[];
  body: Expression;
}
export interface ECaseOfExpr extends SyntaxNode {
  nodeType: "CaseOfExpr";
  expr: Expression;
  branches: ECaseOfBranch[];
}
export interface ECaseOfBranch extends SyntaxNode {
  nodeType: "CaseOfBranch";
  pattern: EPattern;
  expr: Expression;
}
export interface EAnonymousFunctionExpr extends SyntaxNode {
  nodeType: "AnonymousFunctionExpr";
  params: EPattern[];
  expr: Expression;
}
export interface EUnionVariant extends SyntaxNode {
  nodeType: "UnionVariant";
  name: string;
  params: Expression[];
}
export interface EUnionPattern extends SyntaxNode {
  nodeType: "UnionPattern";
  constructor: SyntaxNode;
  namedParams: Expression[];
  argPatterns: Expression[];
}
export interface EValueExpr extends SyntaxNode {
  nodeType: "ValueExpr";
  name: string;
}
export interface EBinOpExpr extends SyntaxNode {
  nodeType: "BinOpExpr";
  parts: Expression[];
}
export interface EOperator extends SyntaxNode {
  nodeType: "Operator";
}
export interface EOperatorAsFunctionExpr extends SyntaxNode {
  nodeType: "OperatorAsFunctionExpr";
  operator: EOperator;
}
export interface ENumberConstant extends SyntaxNode {
  nodeType: "NumberConstant";
  isFloat: boolean;
}
export interface EStringConstant extends SyntaxNode {
  nodeType: "StringConstant";
}
export interface ETypeExpression extends SyntaxNode {
  nodeType: "TypeExpression";
  segments: Expression[];
}
export interface ETypeRef extends SyntaxNode {
  nodeType: "TypeRef";
}
export interface ETypeDeclaration extends SyntaxNode {
  nodeType: "TypeDeclaration";
  name: string;
  typeNames: Expression[];
}
export interface ETypeVariable extends SyntaxNode {
  nodeType: "TypeVariable";
}
export interface ETypeAnnotation extends SyntaxNode {
  nodeType: "TypeAnnotation";
  name: string;
  typeExpression?: ETypeExpression;
}
export interface EInfixDeclaration extends SyntaxNode {
  nodeType: "InfixDeclaration";
  precedence: number;
  associativity: OperatorAssociativity;
}
export interface EFunctionDeclarationLeft extends SyntaxNode {
  nodeType: "FunctionDeclarationLeft";
  params: Pattern[];
}
type Pattern = EPattern | ELowerPattern;
export interface EPattern extends SyntaxNode {
  nodeType: "Pattern";
  patternAs?: ELowerPattern;
}
export interface ELowerPattern extends SyntaxNode {
  nodeType: "LowerPattern";
}
export interface ELowerTypeName extends SyntaxNode {
  nodeType: "LowerTypeName";
}
export interface EUnitExpr extends SyntaxNode {
  nodeType: "UnitExpr";
}
export interface ETupleExpr extends SyntaxNode {
  nodeType: "TupleExpr";
  exprList: Expression[];
}
export interface EAnythingPattern extends SyntaxNode {
  nodeType: "AnythingPattern";
}
export interface ETuplePattern extends SyntaxNode {
  nodeType: "TuplePattern";
  patterns: EPattern[];
}
export interface ETupleType extends SyntaxNode {
  nodeType: "TupleType";
  typeExpressions: ETypeExpression[];
  unitExpr?: EUnitExpr;
}
export interface EListExpr extends SyntaxNode {
  nodeType: "ListExpr";
  exprList: Expression[];
}
export interface EListPattern extends SyntaxNode {
  nodeType: "ListPattern";
  parts: Expression[];
}
export interface EConsPattern extends SyntaxNode {
  nodeType: "ConsPattern";
  parts: Expression[];
}
export interface EFieldType extends SyntaxNode {
  nodeType: "FieldType";
  name: string;
  typeExpression: ETypeExpression;
}
export interface ERecordType extends SyntaxNode {
  nodeType: "RecordType";
  baseType: Expression;
  fieldTypes: EFieldType[];
}
export interface ETypeAliasDeclaration extends SyntaxNode {
  nodeType: "TypeAliasDeclaration";
  name: SyntaxNode;
  typeVariables: Expression[];
  typeExpression: ETypeExpression;
}
export interface EField extends SyntaxNode {
  nodeType: "Field";
  name: Expression;
  expression: Expression;
}
export interface EFieldAccessExpr extends SyntaxNode {
  nodeType: "FieldAccessExpr";
  target: Expression;
}
export interface EFieldAccessorFunctionExpr extends SyntaxNode {
  nodeType: "FieldAccessorFunctionExpr";
}
export interface ERecordPattern extends SyntaxNode {
  nodeType: "RecordPattern";
  patternList: ELowerPattern[];
}
export interface ERecordExpr extends SyntaxNode {
  nodeType: "RecordExpr";
  baseRecord: SyntaxNode;
  fields: EField[];
}
export interface EPortAnnotation extends SyntaxNode {
  nodeType: "PortAnnotation";
  name: string;
  typeExpression: ETypeExpression;
}
export interface ECharConstantExpr extends SyntaxNode {
  nodeType: "CharConstantExpr";
}
export interface EGlslCodeExpr extends SyntaxNode {
  nodeType: "GlslCodeExpr";
  content: SyntaxNode;
}
export interface ENegateExpr extends SyntaxNode {
  nodeType: "NegateExpr";
  expression: Expression;
}
export interface ENullaryConstructorArgumentPattern extends SyntaxNode {
  nodeType: "NullaryConstructorArgumentPattern";
}

export function mapSyntaxNodeToExpression(
  node: SyntaxNode | null | undefined,
): Expression | undefined {
  if (!node) return;

  const start = performance.now();

  try {
    switch (node.type) {
      case "lower_case_identifier":
        return node as Expression;
      case "value_declaration":
        {
          const valueDeclaration = node as EValueDeclaration;
          valueDeclaration.nodeType = "ValueDeclaration";
          valueDeclaration.params =
            node.firstNamedChild?.namedChildren.slice(1).map((a) => a.text) ??
            [];
          valueDeclaration.body = node.childForFieldName("body") ?? undefined;
          valueDeclaration.typeAnnotation = TreeUtils.getTypeAnnotation(node);
          valueDeclaration.pattern =
            node.childForFieldName("pattern") ?? undefined;

          return valueDeclaration;
        }
        break;
      case "value_expr": {
        const valueExpr = node as EValueExpr;
        valueExpr.nodeType = "ValueExpr";
        valueExpr.name = node.text;
        return valueExpr;
      }

      case "bin_op_expr": {
        {
          const binOpExpr = node as EBinOpExpr;
          binOpExpr.nodeType = "BinOpExpr";
          binOpExpr.parts = node.children
            .map(mapSyntaxNodeToExpression)
            .filter(Utils.notUndefined);
          return binOpExpr;
        }
      }

      case "operator_identifier": {
        const operatorIdentifier = node as EOperator;
        operatorIdentifier.nodeType = "Operator";
        return operatorIdentifier;
      }

      case "number_constant_expr": {
        const numberConstantExpr = node as ENumberConstant;
        numberConstantExpr.nodeType = "NumberConstant";
        numberConstantExpr.isFloat = node.text.includes(".");
        return numberConstantExpr;
      }

      case "string_constant_expr": {
        const stringConstantExpr = node as EStringConstant;
        stringConstantExpr.nodeType = "StringConstant";
        return stringConstantExpr;
      }

      case "parenthesized_expr":
        return mapSyntaxNodeToExpression(node.childForFieldName("expression"));

      case "function_call_expr":
        {
          const target = mapSyntaxNodeToExpression(
            node.childForFieldName("target"),
          );

          if (target) {
            const functionCallExpr = node as EFunctionCallExpr;
            functionCallExpr.nodeType = "FunctionCallExpr";
            functionCallExpr.target = target;
            functionCallExpr.args = node.children
              .slice(1)
              .filter((n) => !n.type.includes("comment"))
              .map(mapSyntaxNodeToExpression)
              .filter(Utils.notUndefined);

            return functionCallExpr;
          }
        }
        break;

      case "type_annotation": {
        const typeAnnotation = node as ETypeAnnotation;
        typeAnnotation.nodeType = "TypeAnnotation";
        return typeAnnotation;
      }

      case "type_expression": {
        const typeExpression = node as ETypeExpression;
        typeExpression.nodeType = "TypeExpression";
        typeExpression.segments = node.children
          .map(mapSyntaxNodeToExpression)
          .filter(Utils.notUndefined);
        return typeExpression;
      }

      case "type_variable": {
        const typeVariable = node as ETypeVariable;
        typeVariable.nodeType = "TypeVariable";
        return typeVariable;
      }

      case "type_ref": {
        const typeRef = node as ETypeRef;
        typeRef.nodeType = "TypeRef";
        return typeRef;
      }

      case "type_declaration": {
        const typeDeclaration = node as ETypeDeclaration;
        typeDeclaration.nodeType = "TypeDeclaration";
        return typeDeclaration;
      }

      case "infix_declaration": {
        const infixDeclaration = node as EInfixDeclaration;
        infixDeclaration.nodeType = "InfixDeclaration";
        infixDeclaration.precedence = parseInt(
          node.childForFieldName("precedence")?.text ?? "",
        );
        infixDeclaration.associativity =
          (node
            .childForFieldName("associativity")
            ?.text.toUpperCase() as OperatorAssociativity) ?? "NON";
        return infixDeclaration;
      }

      case "function_declaration_left": {
        const functionDeclarationLeft = node as EFunctionDeclarationLeft;
        functionDeclarationLeft.nodeType = "FunctionDeclarationLeft";
        functionDeclarationLeft.params = node.namedChildren
          .filter((n) => n.type.includes("pattern") || n.type === "unit_expr")
          ?.map(mapSyntaxNodeToExpression)
          .filter(Utils.notUndefined) as Pattern[];
        return functionDeclarationLeft;
      }

      case "pattern": {
        const patternAs = node.childForFieldName("patternAs");
        const pattern = node as EPattern;
        pattern.nodeType = "Pattern";

        if (patternAs) {
          pattern.patternAs = mapSyntaxNodeToExpression(
            patternAs,
          ) as ELowerPattern;
        }
        return pattern;
      }

      case "lower_pattern": {
        const lowerPattern = node as ELowerPattern;
        lowerPattern.nodeType = "LowerPattern";
        return lowerPattern;
      }

      case "lower_type_name": {
        const lowerTypeName = node as ELowerTypeName;
        lowerTypeName.nodeType = "LowerTypeName";
        return lowerTypeName;
      }

      case "union_variant": {
        const unionVariant = node as EUnionVariant;
        unionVariant.nodeType = "UnionVariant";
        unionVariant.name = node.childForFieldName("name")?.text ?? "";
        unionVariant.params = node.children
          .slice(1)
          .map(mapSyntaxNodeToExpression)
          .filter(Utils.notUndefined);
        return unionVariant;
      }

      case "if_else_expr": {
        const ifElseExpr = node as EIfElseExpr;
        ifElseExpr.nodeType = "IfElseExpr";
        ifElseExpr.exprList = node.namedChildren
          .map((n) => mapSyntaxNodeToExpression(n))
          .filter(Utils.notUndefined);
        return ifElseExpr;
      }

      case "let_in_expr": {
        const letInExpr = node as ELetInExpr;
        letInExpr.nodeType = "LetInExpr";
        letInExpr.valueDeclarations =
          (TreeUtils.findAllNamedChildrenOfType("value_declaration", node)?.map(
            mapSyntaxNodeToExpression,
          ) as EValueDeclaration[]) ?? [];
        letInExpr.body = mapSyntaxNodeToExpression(
          node.lastNamedChild,
        ) as Expression;
        return letInExpr;
      }

      case "case_of_expr": {
        const caseOfExpr = node as ECaseOfExpr;
        caseOfExpr.nodeType = "CaseOfExpr";
        caseOfExpr.expr = mapSyntaxNodeToExpression(
          node.namedChildren[1],
        ) as Expression;
        caseOfExpr.branches = node.namedChildren
          .slice(3)
          .map(mapSyntaxNodeToExpression)
          .filter(Utils.notUndefined) as ECaseOfBranch[];
        return caseOfExpr;
      }

      case "case_of_branch": {
        const caseOfBranch = node as ECaseOfBranch;
        caseOfBranch.nodeType = "CaseOfBranch";
        caseOfBranch.pattern = mapSyntaxNodeToExpression(
          node.childForFieldName("pattern"),
        ) as EPattern;
        caseOfBranch.expr = mapSyntaxNodeToExpression(
          node.childForFieldName("expr"),
        ) as Expression;
        return caseOfBranch;
      }

      case "anonymous_function_expr": {
        const anonymousFunctionExpr = node as EAnonymousFunctionExpr;
        anonymousFunctionExpr.nodeType = "AnonymousFunctionExpr";
        anonymousFunctionExpr.params = TreeUtils.findAllNamedChildrenOfType(
          "pattern",
          node,
        )
          ?.map(mapSyntaxNodeToExpression)
          .filter((n) => n?.nodeType === "Pattern") as EPattern[];
        anonymousFunctionExpr.expr = mapSyntaxNodeToExpression(
          node.lastNamedChild,
        ) as Expression;
        return anonymousFunctionExpr;
      }

      case "unit_expr": {
        const unitExpr = node as EUnitExpr;
        unitExpr.nodeType = "UnitExpr";
        return unitExpr;
      }

      case "tuple_expr": {
        const tupleExpr = node as ETupleExpr;
        tupleExpr.nodeType = "TupleExpr";
        tupleExpr.exprList = node.namedChildren
          .map(mapSyntaxNodeToExpression)
          .filter(Utils.notUndefined);
        return tupleExpr;
      }

      case "anything_pattern": {
        const anythingPattern = node as EAnythingPattern;
        anythingPattern.nodeType = "AnythingPattern";
        return anythingPattern;
      }

      case "tuple_pattern": {
        const tuplePattern = node as ETuplePattern;
        tuplePattern.nodeType = "TuplePattern";
        tuplePattern.patterns = TreeUtils.findAllNamedChildrenOfType(
          "pattern",
          node,
        )
          ?.map(mapSyntaxNodeToExpression)
          .filter(Utils.notUndefined) as EPattern[];
        return tuplePattern;
      }

      case "tuple_type": {
        const tupleType = node as ETupleType;
        tupleType.nodeType = "TupleType";
        tupleType.typeExpressions = TreeUtils.findAllNamedChildrenOfType(
          "type_expression",
          node,
        )
          ?.map(mapSyntaxNodeToExpression)
          .filter(Utils.notUndefined) as ETypeExpression[];
        tupleType.unitExpr = mapSyntaxNodeToExpression(
          node.childForFieldName("unitExpr"),
        ) as EUnitExpr;
        return tupleType;
      }

      case "list_expr": {
        const listExpr = node as EListExpr;
        listExpr.nodeType = "ListExpr";
        listExpr.exprList = node.children
          .filter((n) => n.type.endsWith("expr"))
          .map(mapSyntaxNodeToExpression) as Expression[];
        return listExpr;
      }

      case "list_pattern": {
        const listPattern = node as EListPattern;
        listPattern.nodeType = "ListPattern";
        listPattern.parts = node.namedChildren
          .filter((n) => n.type.includes("pattern"))
          .map(mapSyntaxNodeToExpression)
          .filter(Utils.notUndefined);
        return listPattern;
      }

      case "union_pattern": {
        const unionPattern = node as EUnionPattern;
        unionPattern.nodeType = "UnionPattern";
        unionPattern.constructor = node.firstNamedChild as SyntaxNode;
        unionPattern.namedParams = node
          .descendantsOfType("lower_pattern")
          .map(mapSyntaxNodeToExpression)
          .filter(Utils.notUndefined);
        unionPattern.argPatterns = node.namedChildren
          .slice(1)
          .filter(
            (node) =>
              node.type.includes("pattern") ||
              node.type.includes("constant") ||
              node.type === "unit_expr",
          )
          .map(
            (node) => mapSyntaxNodeToExpression(node) ?? node,
          ) as Expression[];
        return unionPattern;
      }

      case "cons_pattern":
        return Object.assign(node, {
          nodeType: "ConsPattern",
          parts: node.namedChildren
            .filter((n) => n.type.includes("pattern"))
            .map(mapSyntaxNodeToExpression)
            .filter(Utils.notUndefined),
        } as EConsPattern);

      case "record_type": {
        const recordType = node as ERecordType;
        recordType.nodeType = "RecordType";
        recordType.baseType = mapSyntaxNodeToExpression(
          node.childForFieldName("baseRecord"),
        ) as Expression;
        recordType.fieldTypes = TreeUtils.findAllNamedChildrenOfType(
          "field_type",
          node,
        )
          ?.map(mapSyntaxNodeToExpression)
          .filter(Utils.notUndefined) as EFieldType[];
        return recordType;
      }

      case "field_type": {
        const fieldType = node as EFieldType;
        fieldType.nodeType = "FieldType";
        fieldType.name = node.childForFieldName("name")?.text ?? "";
        fieldType.typeExpression = mapSyntaxNodeToExpression(
          node.childForFieldName("typeExpression"),
        ) as ETypeExpression;
        return fieldType;
      }

      case "type_alias_declaration": {
        const typeAliasDeclaration = node as ETypeAliasDeclaration;
        typeAliasDeclaration.nodeType = "TypeAliasDeclaration";
        return typeAliasDeclaration;
      }

      case "field": {
        const field = node as EField;
        field.nodeType = "Field";
        field.name = mapSyntaxNodeToExpression(
          node.firstNamedChild,
        ) as Expression;
        field.expression = mapSyntaxNodeToExpression(
          node.lastNamedChild,
        ) as Expression;
        return field;
      }

      case "field_access_expr": {
        const fieldAccessExpr = node as EFieldAccessExpr;
        fieldAccessExpr.nodeType = "FieldAccessExpr";
        fieldAccessExpr.target = mapSyntaxNodeToExpression(
          node.firstNamedChild,
        ) as Expression;
        return fieldAccessExpr;
      }

      case "field_accessor_function_expr": {
        const fieldAccessorFunctionExpr = node as EFieldAccessorFunctionExpr;
        fieldAccessorFunctionExpr.nodeType = "FieldAccessorFunctionExpr";
        return fieldAccessorFunctionExpr;
      }

      case "record_pattern": {
        const recordPattern = node as ERecordPattern;
        recordPattern.nodeType = "RecordPattern";
        recordPattern.patternList = TreeUtils.findAllNamedChildrenOfType(
          "lower_pattern",
          node,
        )
          ?.map(mapSyntaxNodeToExpression)
          .filter(Utils.notUndefined)
          .filter((pattern) => pattern.text !== "") as ELowerPattern[];
        return recordPattern;
      }

      case "record_expr": {
        const recordExpr = node as ERecordExpr;
        recordExpr.nodeType = "RecordExpr";
        recordExpr.baseRecord = node.childForFieldName(
          "baseRecord",
        ) as SyntaxNode;
        recordExpr.fields =
          (TreeUtils.findAllNamedChildrenOfType("field", node)
            ?.map(mapSyntaxNodeToExpression)
            .filter(Utils.notUndefined) as EField[]) ?? [];
        return recordExpr;
      }

      case "port_annotation":
        return Object.assign(node, {
          nodeType: "PortAnnotation",
          name: node.childForFieldName("name")?.text ?? "",
          typeExpression: mapSyntaxNodeToExpression(
            node.childForFieldName("typeExpression"),
          ),
        } as EPortAnnotation);

      case "char_constant_expr": {
        const charConstantExpr = node as ECharConstantExpr;
        charConstantExpr.nodeType = "CharConstantExpr";
        return charConstantExpr;
      }

      case "glsl_code_expr":
        return Object.assign(node, {
          nodeType: "GlslCodeExpr",
          content: node.childForFieldName("content"),
        } as EGlslCodeExpr);

      case "operator_as_function_expr":
        return Object.assign(node, {
          nodeType: "OperatorAsFunctionExpr",
          operator: mapSyntaxNodeToExpression(
            node.childForFieldName("operator"),
          ),
        } as EOperatorAsFunctionExpr);

      case "negate_expr": {
        const negateExpr = node as ENegateExpr;
        negateExpr.nodeType = "NegateExpr";
        negateExpr.expression = mapSyntaxNodeToExpression(
          node.lastNamedChild,
        ) as Expression;
        return negateExpr;
      }

      case "nullary_constructor_argument_pattern":
        return Object.assign(node, {
          nodeType: "NullaryConstructorArgumentPattern",
        } as ENullaryConstructorArgumentPattern);

      default:
        return mapSyntaxNodeToExpression(node.firstNamedChild);
    }
  } finally {
    mappingTime += performance.now() - start;
  }
}

export function mapTypeAliasDeclaration(
  typeAliasDeclaration: ETypeAliasDeclaration,
): void {
  typeAliasDeclaration.name = typeAliasDeclaration.childForFieldName(
    "name",
  ) as SyntaxNode;
  typeAliasDeclaration.typeVariables =
    TreeUtils.findAllNamedChildrenOfType(
      "lower_type_name",
      typeAliasDeclaration,
    )
      ?.map(mapSyntaxNodeToExpression)
      .filter(Utils.notUndefined) ?? [];
  typeAliasDeclaration.typeExpression = mapSyntaxNodeToExpression(
    typeAliasDeclaration.childForFieldName("typeExpression"),
  ) as ETypeExpression;
}

export function mapTypeDeclaration(typeDeclaration: ETypeDeclaration): void {
  typeDeclaration.name = typeDeclaration.childForFieldName("name")?.text ?? "";
  typeDeclaration.typeNames =
    (TreeUtils.findAllNamedChildrenOfType(
      "lower_type_name",
      typeDeclaration,
    )?.map(mapSyntaxNodeToExpression) as Expression[]) ?? [];
}

export function mapTypeAnnotation(typeAnnotation: ETypeAnnotation): void {
  typeAnnotation.name = typeAnnotation.firstNamedChild?.text ?? "";
  typeAnnotation.typeExpression = mapSyntaxNodeToExpression(
    typeAnnotation.childForFieldName("typeExpression"),
  ) as ETypeExpression;
}

export function findDefinition(
  e: SyntaxNode | undefined | null,
  program: IProgram,
): { expr?: Expression; diagnostics: Diagnostic[] } {
  if (!e) {
    return { diagnostics: [] };
  }

  const sourceFile = program.getForest().getByUri(e.tree.uri);

  if (!sourceFile) {
    return { diagnostics: [] };
  }

  const start = performance.now();
  const definition = program
    .getTypeChecker()
    .findDefinitionShallow(e, sourceFile);
  definitionTime += performance.now() - start;

  const mappedNode = mapSyntaxNodeToExpression(definition.symbol?.node);

  return {
    expr: mappedNode,
    diagnostics: definition.diagnostics,
  };
}
