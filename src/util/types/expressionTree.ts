import { SyntaxNode } from "web-tree-sitter";
import { OperatorAssociativity } from "./operatorPrecedence";
import { TreeUtils } from "../treeUtils";
import { notUndefined } from "./typeInference";
import { IImports } from "src/imports";
/* eslint-disable @typescript-eslint/naming-convention */

export type Expression =
  | EAnonymousFunctionExpr
  | EAnythingPattern
  | EBinOpExpr
  | ECaseOfBranch
  | ECaseOfExpr
  | EFunctionCallExpr
  | EFunctionDeclarationLeft
  | EIfElseExpr
  | EInfixDeclaration
  | ELetInExpr
  | EListExpr
  | EListPattern
  | ELowerPattern
  | ELowerTypeName
  | ENumberConstant
  | EOperator
  | EOperatorAsFunctionExpr
  | EPattern
  | EStringConstant
  | ETupleExpr
  | ETuplePattern
  | ETupleType
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
  body?: Expression;
  typeAnnotation?: ETypeAnnotation;
  pattern?: EPattern;
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
}
export interface ENumberConstant extends SyntaxNode {
  nodeType: "NumberConstant";
  isFloat: boolean;
}
interface EStringConstant extends SyntaxNode {
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
  moduleName: string;
  unionVariants: Expression[];
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

export function mapSyntaxNodeToExpression(
  node: SyntaxNode | null | undefined,
): Expression | undefined {
  if (!node) return;

  switch (node.type) {
    case "value_declaration":
      {
        const body = mapSyntaxNodeToExpression(
          node.namedChildren[node.namedChildren.length - 1],
        );

        const typeAnnotation = mapSyntaxNodeToExpression(
          TreeUtils.getTypeAnnotation(node),
        );

        if (body) {
          const params =
            node.firstNamedChild?.namedChildren.slice(1).map((a) => a.text) ??
            [];
          return Object.assign(node, {
            nodeType: "ValueDeclaration",
            params,
            body,
            typeAnnotation,
          } as EValueDeclaration);
        }
      }
      break;
    case "value_expr":
      return Object.assign(node, {
        nodeType: "ValueExpr",
        name: node.text,
      } as EValueExpr);

    case "bin_op_expr": {
      return Object.assign(node, {
        nodeType: "BinOpExpr",
        parts: node.children
          .map(mapSyntaxNodeToExpression)
          .filter(notUndefined),
      } as EBinOpExpr);
    }

    case "operator_identifier": {
      return Object.assign(node, {
        nodeType: "Operator",
      } as EOperator);
    }

    case "number_constant_expr":
      return Object.assign(node, {
        nodeType: "NumberConstant",
        isFloat: false,
      } as ENumberConstant);

    case "string_constant_expr":
      return Object.assign(node, {
        nodeType: "StringConstant",
      } as EStringConstant);

    case "parenthesized_expr":
      return mapSyntaxNodeToExpression(node.children[1]);

    case "function_call_expr":
      {
        const target = mapSyntaxNodeToExpression(node.firstNamedChild);

        if (target) {
          return Object.assign(node, {
            nodeType: "FunctionCallExpr",
            target,
            args: node.children
              .slice(1)
              .map(mapSyntaxNodeToExpression)
              .filter(notUndefined),
          } as EFunctionCallExpr);
        }
      }
      break;

    case "type_annotation":
      return Object.assign(node, {
        nodeType: "TypeAnnotation",
        name: node.firstNamedChild?.text ?? "",
        typeExpression: mapSyntaxNodeToExpression(
          TreeUtils.findFirstNamedChildOfType("type_expression", node),
        ),
      } as ETypeAnnotation);

    case "type_expression":
      return Object.assign(node, {
        nodeType: "TypeExpression",
        segments: node.children
          .filter(
            (n) =>
              n.type !== "arrow" &&
              n.type !== "left_parenthesis" &&
              n.type !== "right_parenthesis",
          )
          .map(mapSyntaxNodeToExpression),
      } as ETypeExpression);

    case "type_variable":
      return Object.assign(node, { nodeType: "TypeVariable" } as ETypeVariable);

    case "type_ref":
      return Object.assign(node, { nodeType: "TypeRef" } as ETypeRef);

    case "type_declaration":
      return Object.assign(node, {
        nodeType: "TypeDeclaration",
        name:
          TreeUtils.findFirstNamedChildOfType("upper_case_identifier", node)
            ?.text ?? "",
        moduleName: TreeUtils.getModuleNameNode(node.tree)?.text ?? "",
        unionVariants: TreeUtils.findAllNamedChildrenOfType(
          "union_variant",
          node,
        ),
        typeNames:
          TreeUtils.findAllNamedChildrenOfType("lower_type_name", node) ?? [],
      } as ETypeDeclaration);

    case "infix_declaration":
      return Object.assign(node, {
        nodeType: "InfixDeclaration",
        precedence: parseInt(
          TreeUtils.findFirstNamedChildOfType("number_literal", node)?.text ??
            "",
        ),
        associativity:
          TreeUtils.findFirstNamedChildOfType(
            "lower_case_identifier",
            node,
          )?.text.toUpperCase() ?? "NON",
      } as EInfixDeclaration);

    case "function_declaration_left":
      return Object.assign(node, {
        nodeType: "FunctionDeclarationLeft",
        params: node.namedChildren
          .filter((n) => n.type.includes("pattern"))
          ?.map(mapSyntaxNodeToExpression)
          .filter(notUndefined),
      } as EFunctionDeclarationLeft);

    case "pattern": {
      const asNode = TreeUtils.findFirstNamedChildOfType("as", node);
      return Object.assign(node, {
        nodeType: "Pattern",
        patternAs: mapSyntaxNodeToExpression(asNode?.nextNamedSibling),
      } as EPattern);
    }

    case "lower_pattern":
      return Object.assign(node, {
        nodeType: "LowerPattern",
      } as ELowerPattern);

    case "lower_type_name":
      return Object.assign(node, {
        nodeType: "LowerTypeName",
      } as ELowerTypeName);

    case "union_variant":
      return Object.assign(node, {
        nodeType: "UnionVariant",
        name: node.firstNamedChild?.text ?? "",
        params: node.namedChildren
          .slice(1)
          .map(mapSyntaxNodeToExpression)
          .filter(notUndefined),
      } as EUnionVariant);

    case "if_else_expr":
      return Object.assign(node, {
        nodeType: "IfElseExpr",
        exprList: node.namedChildren.map((n) =>
          mapSyntaxNodeToExpression(n.firstNamedChild),
        ),
      } as EIfElseExpr);

    case "let_in_expr":
      return Object.assign(node, {
        nodeType: "LetInExpr",
        valueDeclarations:
          node.firstNamedChild?.type === "let"
            ? TreeUtils.findAllNamedChildrenOfType(
                "value_declaration",
                node.firstNamedChild,
              )?.map(mapSyntaxNodeToExpression)
            : [],
        body: mapSyntaxNodeToExpression(node.lastNamedChild?.firstNamedChild),
      } as ELetInExpr);

    case "case_of_expr":
      return Object.assign(node, {
        nodeType: "CaseOfExpr",
        expr: mapSyntaxNodeToExpression(node.namedChildren[1]),
        branches: node.namedChildren
          .slice(3)
          .map(mapSyntaxNodeToExpression)
          .filter(notUndefined),
      } as ECaseOfExpr);

    case "case_of_branch":
      return Object.assign(node, {
        nodeType: "CaseOfBranch",
        pattern: mapSyntaxNodeToExpression(
          TreeUtils.findFirstNamedChildOfType("pattern", node),
        ),
        expr: mapSyntaxNodeToExpression(node.lastNamedChild),
      } as ECaseOfBranch);

    case "anonymous_function_expr":
      return Object.assign(node, {
        nodeType: "AnonymousFunctionExpr",
        params: TreeUtils.findAllNamedChildrenOfType("pattern", node)
          ?.map(mapSyntaxNodeToExpression)
          .filter((n) => n?.nodeType === "Pattern"),
        expr: mapSyntaxNodeToExpression(node.lastNamedChild),
      } as EAnonymousFunctionExpr);

    case "unit_expr":
      return Object.assign(node, {
        nodeType: "UnitExpr",
      } as EUnitExpr);

    case "tuple_expr":
      return Object.assign(node, {
        nodeType: "TupleExpr",
        exprList: node.namedChildren
          .filter(
            (n) =>
              n.type !== "left_parenthesis" &&
              n.type !== "comma" &&
              n.type !== "right_parenthesis",
          )
          .map(mapSyntaxNodeToExpression)
          .filter(notUndefined),
      } as ETupleExpr);

    case "anything_pattern":
      return Object.assign(node, {
        nodeType: "AnythingPattern",
      } as EAnythingPattern);

    case "tuple_pattern":
      return Object.assign(node, {
        nodeType: "TuplePattern",
        patterns: TreeUtils.findAllNamedChildrenOfType("pattern", node)
          ?.map(mapSyntaxNodeToExpression)
          .filter(notUndefined),
      } as ETuplePattern);

    case "tuple_type":
      return Object.assign(node, {
        nodeType: "TupleType",
        typeExpressions: TreeUtils.findAllNamedChildrenOfType(
          "type_expression",
          node,
        )
          ?.map(mapSyntaxNodeToExpression)
          .filter(notUndefined),
        unitExpr: mapSyntaxNodeToExpression(
          TreeUtils.findFirstNamedChildOfType("unit_expr", node),
        ),
      } as ETupleType);

    case "list_expr":
      return Object.assign(node, {
        nodeType: "ListExpr",
        exprList: node.namedChildren
          .filter((n) => n.type.endsWith("expr"))
          .map(mapSyntaxNodeToExpression)
          .filter(notUndefined),
      } as EListExpr);

    case "list_pattern":
      return Object.assign(node, {
        nodeType: "ListPattern",
        parts: node.namedChildren
          .filter((n) => n.type.includes("pattern"))
          .map(mapSyntaxNodeToExpression)
          .filter(notUndefined),
      } as EListPattern);

    case "union_pattern":
      return Object.assign(node, {
        nodeType: "UnionPattern",
        constructor: node.firstNamedChild,
        namedParams: node.namedChildren
          .filter((n) => n.type.includes("pattern"))
          .map(mapSyntaxNodeToExpression)
          .filter(notUndefined),
        argPatterns: node.namedChildren
          .filter((n) => n.type.includes("pattern"))
          .map(mapSyntaxNodeToExpression)
          .filter(notUndefined),
      } as EUnionPattern);
    default:
      return mapSyntaxNodeToExpression(node.firstNamedChild);
  }
}

export function findDefinition(
  e: SyntaxNode | undefined | null,
  uri: string,
  imports: IImports,
): { expr: Expression; uri: string } | undefined {
  if (!e) {
    return;
  }

  const definition = TreeUtils.findDefinitionNodeByReferencingNode(
    e,
    uri,
    e.tree,
    imports,
  );

  const mappedNode = mapSyntaxNodeToExpression(definition?.node);

  if (mappedNode && definition) {
    return {
      expr: mappedNode,
      uri: definition.uri,
    };
  }
}
