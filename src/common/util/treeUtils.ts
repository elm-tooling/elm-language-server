import { Position } from "vscode-languageserver";
import { Node, Tree } from "web-tree-sitter";
import { ISourceFile } from "../../compiler/forest";
import { comparePosition, positionEquals } from "../positionUtil";
import { TRecord, Type } from "../../compiler/typeInference";
import { IProgram } from "../../compiler/program";
import {
  EFunctionCallExpr,
  mapSyntaxNodeToExpression,
} from "../../compiler/utils/expressionTree";
import { Range } from "vscode-languageserver-textdocument";
import { ISymbol } from "../../compiler/binder";

export type NodeType =
  | "Function"
  | "FunctionParameter"
  | "TypeAlias"
  | "Type"
  | "Operator"
  | "Module"
  | "CasePattern"
  | "AnonymousFunctionParameter"
  | "UnionConstructor"
  | "FieldType"
  | "TypeVariable"
  | "Port"
  | "Import";

const functionNameRegex = new RegExp("[a-zA-Z0-9_]+");

export class TreeUtils {
  public static getModuleNameNode(tree: Tree): Node | undefined {
    const moduleDeclaration: Node | undefined =
      this.findModuleDeclaration(tree);
    return moduleDeclaration?.childForFieldName("name") ?? undefined;
  }

  public static getModuleNameCommentNode(tree: Tree): Node | undefined {
    const moduleDeclaration: Node | undefined =
      this.findModuleDeclaration(tree);
    return moduleDeclaration?.nextNamedSibling?.type === "block_comment"
      ? moduleDeclaration.nextNamedSibling
      : undefined;
  }

  public static getModuleExposingListNodes(tree: Tree): Node[] {
    const moduleNode = TreeUtils.findModuleDeclaration(tree);

    if (moduleNode) {
      return [
        ...moduleNode.descendantsOfType(["exposed_value", "exposed_type"]),
      ];
    }

    return [];
  }

  public static findFirstNamedChildOfType(
    type: string,
    node: Node,
  ): Node | undefined {
    return node.children.find((child) => child.type === type);
  }

  public static findAllNamedChildrenOfType(
    type: string | string[],
    node: Node,
  ): Node[] | undefined {
    const result = Array.isArray(type)
      ? node.children.filter((child) => type.includes(child.type))
      : node.children.filter((child) => child.type === type);

    return result.length === 0 ? undefined : result;
  }

  public static findExposedFunctionNode(
    node: Node,
    functionName: string,
  ): Node | undefined {
    if (node) {
      const exposingList = this.findFirstNamedChildOfType(
        "exposing_list",
        node,
      );
      if (exposingList) {
        const doubleDot = this.findFirstNamedChildOfType(
          "double_dot",
          exposingList,
        );
        if (doubleDot) {
          return undefined;
        }
      }
      const descendants = TreeUtils.descendantsOfType(node, "exposed_value");
      return descendants.find((desc) => desc.text === functionName);
    }
  }

  public static isExposedFunctionOrPort(
    tree: Tree,
    functionName: string,
  ): boolean {
    const module = this.findModuleDeclaration(tree);
    if (module) {
      const exposingList = this.findFirstNamedChildOfType(
        "exposing_list",
        module,
      );
      if (exposingList) {
        const doubleDot = exposingList.childForFieldName("doubleDot");
        if (doubleDot) {
          return true;
        }
      }
      const descendants = TreeUtils.descendantsOfType(module, "exposed_value");
      return descendants.some((desc) => desc.text === functionName);
    }
    return false;
  }

  public static findExposedTypeOrTypeAliasNode(
    node: Node,
    typeName: string,
  ): Node | undefined {
    if (node) {
      const exposingList = this.findFirstNamedChildOfType(
        "exposing_list",
        node,
      );
      if (exposingList) {
        const doubleDot = this.findFirstNamedChildOfType(
          "double_dot",
          exposingList,
        );
        if (doubleDot) {
          return undefined;
        }
      }
      const descendants = TreeUtils.descendantsOfType(node, "exposed_type");
      const match = descendants.find(
        (desc) =>
          desc.text === typeName || `${desc.text}(`.startsWith(typeName),
      );
      if (match && match.firstNamedChild) {
        return match.firstNamedChild;
      }
    }
    return undefined;
  }

  public static isExposedTypeOrTypeAlias(
    tree: Tree,
    typeName: string,
  ): boolean {
    const module = this.findModuleDeclaration(tree);
    if (module) {
      const exposingList = this.findFirstNamedChildOfType(
        "exposing_list",
        module,
      );
      if (exposingList) {
        const doubleDot = this.findFirstNamedChildOfType(
          "double_dot",
          exposingList,
        );
        if (doubleDot) {
          return true;
        }
      }
      const typeNameDoubleDot = `${typeName}(..)`;
      const descendants = TreeUtils.descendantsOfType(module, "exposed_type");
      return descendants.some(
        (desc) => desc.text === typeName || desc.text === typeNameDoubleDot,
      );
    }
    return false;
  }

  public static findUnionConstructorCalls(
    tree: Tree,
    unionConstructorName: string,
    moduleNamePrefix?: string,
  ): Node[] | undefined {
    const upperCaseQid = TreeUtils.descendantsOfType(
      tree.rootNode,
      "upper_case_qid",
    );
    if (upperCaseQid.length > 0) {
      const result = upperCaseQid.filter(
        (a) =>
          (a.text === unionConstructorName ||
            (moduleNamePrefix &&
              a.text === `${moduleNamePrefix}.${unionConstructorName}`)) &&
          a.parent &&
          a.parent.type !== "type_ref" &&
          a.parent.type !== "import_clause",
      );
      return result.length === 0 ? undefined : result;
    }
  }

  public static findOperator(
    sourceFile: ISourceFile,
    operatorName: string,
  ): Node | undefined {
    const rootSymbols = sourceFile.symbolLinks?.get(sourceFile.tree.rootNode);

    const operatorNode = rootSymbols?.get(operatorName)?.node;

    if (operatorNode) {
      const functionReference = TreeUtils.findFirstNamedChildOfType(
        "value_expr",
        operatorNode,
      );
      if (functionReference) {
        return rootSymbols?.get(
          functionReference.text,
          (s) => s.node.type !== "infix_declaration",
        )?.node;
      }
    }
  }

  public static findTypeDeclaration(
    tree: Tree,
    typeName: string,
  ): Node | undefined {
    const types = this.findAllTypeDeclarations(tree);
    if (types) {
      return types.find(
        (a) =>
          a.children.length > 1 &&
          a.children[1].type === "upper_case_identifier" &&
          a.children[1].text === typeName,
      );
    }
  }

  public static findModuleDeclaration(tree: Tree): Node | undefined {
    return tree.rootNode.childForFieldName("moduleDeclaration") ?? undefined;
  }

  public static findAllTopLevelFunctionDeclarations(
    tree: Tree,
  ): Node[] | undefined {
    const result = tree.rootNode.children.filter(
      (a) => a.type === "value_declaration",
    );
    return result.length === 0 ? undefined : result;
  }

  public static getFunctionNameNodeFromDefinition(
    node: Node,
  ): Node | undefined {
    if (node.type === "lower_case_identifier") {
      return node;
    }
    const declaration =
      node.type == "function_declaration_left"
        ? node
        : node.childForFieldName("functionDeclarationLeft");
    if (declaration && declaration.firstNamedChild) {
      return declaration.firstNamedChild;
    }
  }

  public static getTypeOrTypeAliasOrPortNameNodeFromDefinition(
    node: Node,
  ): Node | undefined {
    return node.childForFieldName("name") ?? undefined;
  }

  public static isTypeUsage(upperCaseQid: Node): boolean {
    return (
      !!TreeUtils.findParentOfType("type_ref", upperCaseQid) ||
      upperCaseQid.parent?.type === "exposed_type"
    );
  }

  public static isConstructorUsage(upperCaseQid: Node): boolean {
    return upperCaseQid.parent?.type === "value_expr";
  }

  public static findTypeOrTypeAliasCalls(
    tree: Tree,
    typeOrTypeAliasName: string,
    nodeType: NodeType,
  ): Node[] {
    const upperCaseQids = TreeUtils.descendantsOfType(
      tree.rootNode,
      "upper_case_qid",
    );

    const supportsTypeUsage = nodeType === "Type" || nodeType === "TypeAlias";
    const supportsConstructorUsage = nodeType === "TypeAlias";

    return upperCaseQids.filter((a) => {
      return (
        a.text === typeOrTypeAliasName &&
        ((supportsTypeUsage && TreeUtils.isTypeUsage(a)) ||
          (supportsConstructorUsage && TreeUtils.isConstructorUsage(a)))
      );
    });
  }

  public static findAllTypeDeclarations(tree: Tree): Node[] | undefined {
    return this.findAllNamedChildrenOfType("type_declaration", tree.rootNode);
  }

  /**
   * @deprecated Should not be used due to performance. Use bindings instead
   */
  public static findImportClauseByName(
    tree: Tree,
    moduleName: string,
  ): Node | undefined {
    const allImports = this.findAllImportClauseNodes(tree);
    if (allImports) {
      return allImports.find(
        (a) =>
          a.children.length > 1 &&
          a.children[1].type === "upper_case_qid" &&
          a.children[1].text === moduleName,
      );
    }
  }

  public static getTypeOrTypeAliasOfFunctionParameter(
    node: Node | undefined,
  ): Node | undefined {
    if (
      node &&
      node.parent &&
      node.parent.parent &&
      node.parent.parent.parent &&
      node.parent.parent.parent.previousNamedSibling &&
      node.parent.parent.parent.previousNamedSibling.type ===
        "type_annotation" &&
      node.parent.parent.parent.previousNamedSibling.lastNamedChild
    ) {
      const functionParameterNodes = TreeUtils.findAllNamedChildrenOfType(
        ["pattern", "lower_pattern", "record_pattern"],
        node.parent.parent,
      );
      if (functionParameterNodes) {
        const matchIndex = functionParameterNodes.findIndex(
          (a) => a.text === node.text,
        );

        const typeAnnotationNodes = TreeUtils.findAllNamedChildrenOfType(
          ["type_ref", "type_expression"],
          node.parent.parent.parent.previousNamedSibling.lastNamedChild,
        );
        if (typeAnnotationNodes) {
          return typeAnnotationNodes[matchIndex];
        }
      }
    }
  }

  public static getReturnTypeOrTypeAliasOfFunctionDefinition(
    node: Node | undefined,
  ): Node | undefined {
    if (node && node.previousNamedSibling?.type === "type_annotation") {
      const typeAnnotationNodes = TreeUtils.descendantsOfType(
        node.previousNamedSibling,
        "type_ref",
      );
      if (typeAnnotationNodes) {
        const type = typeAnnotationNodes[typeAnnotationNodes.length - 1];
        return type.firstNamedChild?.firstNamedChild ?? type;
      }
    }
  }

  public static getRecordTypeOfFunctionRecordParameter(
    node: Node | undefined,
    program: IProgram,
  ): TRecord | undefined {
    const checker = program.getTypeChecker();
    if (
      node?.parent?.type === "function_call_expr" &&
      node.parent.firstNamedChild
    ) {
      const functionCallExpr = mapSyntaxNodeToExpression(
        node.parent,
      ) as EFunctionCallExpr;

      const parameterIndex =
        functionCallExpr.namedChildren.map((c) => c.text).indexOf(node.text) -
        1;

      const foundType = checker.findType(functionCallExpr.target);

      if (foundType.nodeType === "Function") {
        const paramType = foundType.params[parameterIndex];

        if (paramType.nodeType === "Record") {
          return paramType;
        }
      }
    }
  }

  public static getTypeAliasOfRecordField(
    node: Node | undefined,
    sourceFile: ISourceFile,
    program: IProgram,
  ): Node | undefined {
    const fieldName = node?.parent?.firstNamedChild?.text;

    let recordType = TreeUtils.getTypeAliasOfRecord(node, sourceFile, program);

    while (!recordType && node?.parent?.parent) {
      node = node.parent.parent;
      recordType = TreeUtils.getTypeAliasOfRecordField(
        node,
        sourceFile,
        program,
      );
    }

    const recordTypeSourceFile = recordType
      ? program.getSourceFile(recordType.tree.uri)
      : undefined;

    if (recordType && recordTypeSourceFile) {
      const fieldTypes = TreeUtils.descendantsOfType(recordType, "field_type");
      const fieldNode = fieldTypes.find((a) => {
        return (
          TreeUtils.findFirstNamedChildOfType("lower_case_identifier", a)
            ?.text === fieldName
        );
      });

      if (fieldNode) {
        const typeExpression = TreeUtils.findFirstNamedChildOfType(
          "type_expression",
          fieldNode,
        );

        if (typeExpression) {
          const typeNode = TreeUtils.descendantsOfType(
            typeExpression,
            "upper_case_identifier",
          );

          if (typeNode.length > 0) {
            const typeAliasNode = program
              .getTypeChecker()
              .findDefinition(typeNode[0], recordTypeSourceFile).symbol;

            if (typeAliasNode) {
              return typeAliasNode.node;
            }
          }
        }
      }
    }
  }

  public static getTypeAliasOfRecord(
    node: Node | undefined,
    sourceFile: ISourceFile,
    program: IProgram,
  ): Node | undefined {
    if (node?.parent?.parent) {
      let type: Node | undefined | null =
        TreeUtils.findFirstNamedChildOfType(
          "record_base_identifier",
          node.parent.parent,
        ) ??
        TreeUtils.findFirstNamedChildOfType(
          "record_base_identifier",
          node.parent,
        );

      // Handle records of function returns
      if (!type && node.parent.parent.parent) {
        type =
          TreeUtils.getReturnTypeOrTypeAliasOfFunctionDefinition(
            node.parent.parent.parent,
          )?.parent ?? undefined;
      }

      if (!type) {
        type = node;
      }

      if (type) {
        const definitionNode = program
          .getTypeChecker()
          .findDefinition(
            type.firstNamedChild ? type.firstNamedChild : type,
            sourceFile,
          ).symbol;

        if (definitionNode) {
          const definitionTree = program.getSourceFile(
            definitionNode.node.tree.uri,
          );

          let aliasNode;
          if (
            definitionNode.type === "FunctionParameter" &&
            definitionNode.node.firstNamedChild
          ) {
            aliasNode = TreeUtils.getTypeOrTypeAliasOfFunctionParameter(
              definitionNode.node.firstNamedChild,
            );
          } else if (definitionNode.type === "Function") {
            aliasNode = TreeUtils.getReturnTypeOrTypeAliasOfFunctionDefinition(
              definitionNode.node,
            );
          } else if (definitionNode.type === "FieldType") {
            aliasNode = TreeUtils.findFirstNamedChildOfType(
              "type_expression",
              definitionNode.node,
            );
          } else if (definitionNode.type === "TypeAlias") {
            return definitionNode.node;
          }

          if (aliasNode && definitionTree) {
            const childNode = TreeUtils.descendantsOfType(
              aliasNode,
              "upper_case_identifier",
            );

            if (childNode.length > 0) {
              const typeNode = program
                .getTypeChecker()
                .findDefinition(childNode[0], definitionTree).symbol;

              if (typeNode) {
                return typeNode.node;
              }
            }
          }
        }
      }
    }
  }

  public static getAllFieldsFromTypeAlias(
    node: Node | undefined,
  ): { field: string; type: string }[] | undefined {
    const result: { field: string; type: string }[] = [];
    if (node) {
      const fieldTypes = TreeUtils.descendantsOfType(node, "field_type");
      if (fieldTypes.length > 0) {
        fieldTypes.forEach((a) => {
          const fieldName = TreeUtils.findFirstNamedChildOfType(
            "lower_case_identifier",
            a,
          );
          const typeExpression = TreeUtils.findFirstNamedChildOfType(
            "type_expression",
            a,
          );
          if (fieldName && typeExpression) {
            result.push({ field: fieldName.text, type: typeExpression.text });
          }
        });
      }
    }
    return result.length === 0 ? undefined : result;
  }

  public static descendantsOfType(node: Node, type: string): Node[] {
    return node.descendantsOfType(type);
  }

  public static getNamedDescendantForPosition(
    node: Node,
    position: Position,
  ): Node {
    const previousCharColumn =
      position.character === 0 ? 0 : position.character - 1;
    const charBeforeCursor = node.text
      .split("\n")
      [position.line].substring(previousCharColumn, position.character);

    if (!functionNameRegex.test(charBeforeCursor)) {
      return node.namedDescendantForPosition({
        column: position.character,
        row: position.line,
      });
    } else {
      return node.namedDescendantForPosition(
        {
          column: previousCharColumn,
          row: position.line,
        },
        {
          column: position.character,
          row: position.line,
        },
      );
    }
  }

  public static getDescendantForPosition(node: Node, position: Position): Node {
    const previousCharColumn =
      position.character === 0 ? 0 : position.character - 1;
    const charBeforeCursor = node.text
      .split("\n")
      [position.line].substring(previousCharColumn, position.character);

    if (!functionNameRegex.test(charBeforeCursor)) {
      return node.descendantForPosition({
        column: position.character,
        row: position.line,
      });
    } else {
      return node.descendantForPosition(
        {
          column: previousCharColumn,
          row: position.line,
        },
        {
          column: position.character,
          row: position.line,
        },
      );
    }
  }

  public static getNamedDescendantForRange(
    sourceFile: ISourceFile,
    range: Range,
  ): Node {
    if (positionEquals(range.start, range.end)) {
      return this.getNamedDescendantForPosition(sourceFile.tree.rootNode, {
        character: range.start.character,
        line: range.start.line,
      });
    } else {
      return sourceFile.tree.rootNode.namedDescendantForPosition(
        {
          column: range.start.character,
          row: range.start.line,
        },
        {
          column: range.end.character,
          row: range.end.line,
        },
      );
    }
  }

  public static getDescendantForRange(
    sourceFile: ISourceFile,
    range: Range,
  ): Node {
    if (positionEquals(range.start, range.end)) {
      return this.getDescendantForPosition(sourceFile.tree.rootNode, {
        character: range.start.character,
        line: range.start.line,
      });
    } else {
      return sourceFile.tree.rootNode.descendantForPosition(
        {
          column: range.start.character,
          row: range.start.line,
        },
        {
          column: range.end.character,
          row: range.end.line,
        },
      );
    }
  }

  public static findPreviousNode(
    node: Node,
    position: Position,
  ): Node | undefined {
    function nodeHasTokens(n: Node): boolean {
      return n.endIndex - n.startIndex !== 0;
    }

    function findRightmostChildWithTokens(
      childrenList: Node[],
      startIndex: number,
    ): Node | undefined {
      for (let i = startIndex - 1; i >= 0; i--) {
        if (nodeHasTokens(childrenList[i])) {
          return childrenList[i];
        }
      }
    }

    function findRightmostNode(n: Node): Node | undefined {
      if (n.children.length === 0) {
        return n;
      }

      const candidate = findRightmostChildWithTokens(
        n.children,
        n.children.length,
      );

      if (candidate) {
        return findRightmostNode(candidate);
      }
    }

    const children = node.children;

    if (children.length === 0) {
      return node;
    }

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (comparePosition(position, child.endPosition) < 0) {
        const lookInPreviousChild =
          comparePosition(position, child.startPosition) <= 0 ||
          !nodeHasTokens(child);

        if (lookInPreviousChild) {
          const candidate = findRightmostChildWithTokens(children, i);
          if (candidate) {
            return findRightmostNode(candidate);
          }
        } else {
          return this.findPreviousNode(child, position);
        }
      }
    }

    const candidate = findRightmostChildWithTokens(children, children.length);
    if (candidate) {
      return findRightmostNode(candidate);
    }
  }

  public static getNamedDescendantForLineBeforePosition(
    node: Node,
    position: Position,
  ): Node {
    const previousLine = position.line === 0 ? 0 : position.line - 1;

    return node.namedDescendantForPosition({
      column: 0,
      row: previousLine,
    });
  }

  public static getNamedDescendantForLineAfterPosition(
    node: Node,
    position: Position,
  ): Node {
    const followingLine = position.line + 1;

    return node.namedDescendantForPosition({
      column: 0,
      row: followingLine,
    });
  }

  public static findParentOfType(
    typeToLookFor: string,
    node: Node,
    topLevel = false,
  ): Node | undefined {
    if (
      node.type === typeToLookFor &&
      (!topLevel || node.parent?.type === "file")
    ) {
      return node;
    }
    if (node.parent) {
      return this.findParentOfType(typeToLookFor, node.parent, topLevel);
    }
  }

  public static getLastImportNode(tree: Tree): Node | undefined {
    const allImportNodes = this.findAllImportClauseNodes(tree);
    if (allImportNodes?.length) {
      return allImportNodes[allImportNodes.length - 1];
    }
  }

  public static isReferenceFullyQualified(node: Node): boolean {
    return (
      node.previousNamedSibling?.type === "dot" &&
      node.previousNamedSibling?.previousNamedSibling?.type ===
        "upper_case_identifier"
    );
  }

  public static getTypeAnnotation(valueDeclaration?: Node): Node | undefined {
    if (valueDeclaration?.type !== "value_declaration") {
      return;
    }

    let candidate = valueDeclaration.previousNamedSibling;

    // Skip comments
    while (
      candidate?.type === "line_comment" ||
      candidate?.type === "comment_block"
    ) {
      candidate = candidate.previousNamedSibling;
    }

    if (candidate?.type === "type_annotation") {
      return candidate;
    }
  }

  public static getValueDeclaration(typeAnnotation?: Node): Node | undefined {
    if (typeAnnotation?.type !== "type_annotation") {
      return;
    }

    let candidate = typeAnnotation.nextNamedSibling;

    // Skip comments
    while (
      candidate?.type === "line_comment" ||
      candidate?.type === "comment_block"
    ) {
      candidate = candidate.nextNamedSibling;
    }

    if (candidate?.type === "value_declaration") {
      return candidate;
    }
  }

  /**
   * This gets a list of all ancestors of a type
   * in order from the closest declaration up to the top level declaration
   */
  public static getAllAncestorsOfType(type: string, node: Node): Node[] {
    const declarations = [];

    while (node.type !== "file") {
      if (node.type === type) {
        declarations.push(node);
      }

      if (node.parent) {
        node = node.parent;
      } else {
        break;
      }
    }

    return declarations;
  }

  /**
   * @deprecated Should not be used due to performance. Use bindings instead
   */
  public static findAllImportClauseNodes(tree: Tree): Node[] | undefined {
    const result = tree.rootNode.children.filter(
      (a) => a.type === "import_clause",
    );

    return result.length === 0 ? undefined : result;
  }

  public static isIdentifier(node: Node): boolean {
    return (
      node.type === "lower_case_identifier" ||
      node.type === "upper_case_identifier"
    );
  }

  public static isImport(node: Node): boolean {
    return (
      node.parent?.firstNamedChild?.type === "import" ||
      node.parent?.parent?.firstNamedChild?.type === "import"
    );
  }

  public static nextNode(node: Node): Node | undefined {
    // Move up until we have a sibling
    while (!node.nextNamedSibling && node.parent) {
      node = node.parent;
    }

    if (node.nextNamedSibling) {
      node = node.nextNamedSibling;

      // Move down the leftmost subtree
      while (node.firstNamedChild) {
        node = node.firstNamedChild;
      }

      return node;
    }
  }

  public static findFieldReference(
    type: Type,
    fieldName: string,
  ): ISymbol | undefined {
    if (type.nodeType === "Record") {
      const fieldRefs = type.fieldReferences.get(fieldName);

      if (fieldRefs.length > 0) {
        return { name: fieldName, node: fieldRefs[0], type: "FieldType" };
      }
    }
  }

  public static findImportAliasOfModule(
    moduleName: string,
    tree: Tree,
  ): string | undefined {
    const importClause = TreeUtils.findImportClauseByName(tree, moduleName);

    const asClause = importClause?.childForFieldName("asClause");

    if (asClause) {
      return asClause.childForFieldName("name")?.text;
    } else {
      return importClause?.childForFieldName("moduleName")?.text;
    }
  }
}
