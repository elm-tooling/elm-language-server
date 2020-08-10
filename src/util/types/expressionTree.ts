import { SyntaxNode } from "web-tree-sitter";
import { OperatorAssociativity } from "./operatorPrecedence";
import { TreeUtils } from "../treeUtils";
import { notUndefined } from "./typeInference";
import { IImports } from "src/imports";
/* eslint-disable @typescript-eslint/naming-convention */

export type Expression =
  | EBinOpExpr
  | EFunctionCallExpr
  | EFunctionDeclarationLeft
  | EInfixDeclaration
  | ELowerPattern
  | ELowerTypeName
  | ENumberConstant
  | EOperator
  | EOperatorAsFunctionExpr
  | EPattern
  | EStringConstant
  | ETypeAnnotation
  | ETypeDeclaration
  | ETypeExpression
  | ETypeRef
  | ETypeVariable
  | EUnionVariant
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
interface EIfElseExpr {
  nodeType: "IfElseExpr";
  exprList: Expression[];
}
export interface ELetInExpr {
  nodeType: "LetInExpr";
  name: string;
  valueDeclarations: EValueDeclaration[];
  body: Expression;
}
export interface EUnionVariant extends SyntaxNode {
  nodeType: "UnionVariant";
  name: string;
  params: Expression[];
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

export function mapSyntaxNodeToTypeTree(
  node: SyntaxNode | null | undefined,
): Expression | undefined {
  if (!node) return;

  switch (node.type) {
    case "value_declaration":
      {
        const body = mapSyntaxNodeToTypeTree(
          node.namedChildren[node.namedChildren.length - 1],
        );

        const typeAnnotation = mapSyntaxNodeToTypeTree(
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
        parts: node.children.map(mapSyntaxNodeToTypeTree).filter(notUndefined),
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
      return mapSyntaxNodeToTypeTree(node.children[1]);

    case "function_call_expr":
      {
        const target = mapSyntaxNodeToTypeTree(node.firstNamedChild);

        if (target) {
          return Object.assign(node, {
            nodeType: "FunctionCallExpr",
            target,
            args: node.children
              .slice(1)
              .map(mapSyntaxNodeToTypeTree)
              .filter(notUndefined),
          } as EFunctionCallExpr);
        }
      }
      break;

    case "type_annotation":
      return Object.assign(node, {
        nodeType: "TypeAnnotation",
        name: node.firstNamedChild?.text ?? "",
        typeExpression: mapSyntaxNodeToTypeTree(
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
          .map(mapSyntaxNodeToTypeTree),
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
      } as EFunctionDeclarationLeft);

    case "pattern": {
      const asNode = TreeUtils.findFirstNamedChildOfType("as", node);
      return Object.assign(node, {
        nodeType: "Pattern",
        patternAs: mapSyntaxNodeToTypeTree(asNode?.nextNamedSibling),
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
          .map(mapSyntaxNodeToTypeTree)
          .filter(notUndefined),
      } as EUnionVariant);

    default:
      return mapSyntaxNodeToTypeTree(node.firstNamedChild);
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

  const mappedNode = mapSyntaxNodeToTypeTree(definition?.node);

  if (mappedNode && definition) {
    return {
      expr: mappedNode,
      uri: definition.uri,
    };
  }
}
