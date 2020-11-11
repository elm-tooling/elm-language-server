/* eslint-disable @typescript-eslint/no-use-before-define */
import { ITreeContainer } from "src/forest";
import { SyntaxNode } from "web-tree-sitter";
import { MultiMap } from "../multiMap";
import { NodeType, TreeUtils } from "../treeUtils";
import { SyntaxNodeMap } from "./syntaxNodeMap";

export type SymbolMap = MultiMap<string, ISymbol>;
function createSymbolMap(): SymbolMap {
  return new MultiMap<string, ISymbol>();
}

export interface ISymbol {
  node: SyntaxNode;
  type: NodeType;
}

export function bindTreeContainer(treeContainer: ITreeContainer): void {
  if (treeContainer.symbolLinks) {
    return;
  }

  const symbolLinks = new SyntaxNodeMap<SyntaxNode, SymbolMap>();
  let container: SymbolMap;
  let parent: SyntaxNode;
  const treeCursor = treeContainer.tree.walk();

  bind();

  treeContainer.symbolLinks = symbolLinks;

  function forEachChild(func: () => void): void {
    if (treeCursor.gotoFirstChild()) {
      func();

      while (treeCursor.gotoNextSibling()) {
        func();
      }

      treeCursor.gotoParent();
    }
  }

  function bind(): void {
    const node = treeCursor.currentNode();
    switch (node.type) {
      case "file":
      case "let_in_expr":
      case "anonymous_function_expr":
      case "case_of_branch":
        bindContainer(node);
        break;
      case "value_declaration":
        bindValueDeclaration(node);
        break;
      case "function_declaration_left":
        bindFunctionDeclarationLeft(node);
        break;
      case "type_declaration":
        bindTypeDeclaration(node);
        break;
      case "type_alias_declaration":
        bindTypeAliasDeclaration(node);
        break;
      case "lower_type_name":
        bindLowerTypeName(node);
        break;
      case "port_annotation":
        bindPortAnnotation(node);
        break;
      case "pattern":
        bindPattern(node);
        break;
      default:
        forEachChild(bind);
    }
  }

  function bindContainer(node: SyntaxNode): void {
    const savedContainer = container;
    const savedParent = parent;

    container = createSymbolMap();
    parent = node;

    symbolLinks.set(node, container);

    forEachChild(bind);

    container = savedContainer;
    parent = savedParent;
  }

  function bindValueDeclaration(node: SyntaxNode): void {
    // Bind the function name
    const functionDeclarationLeft = node.childForFieldName(
      "functionDeclarationLeft",
    );

    if (functionDeclarationLeft && functionDeclarationLeft.firstChild) {
      container.set(functionDeclarationLeft.firstChild.text, {
        node: functionDeclarationLeft,
        type: "Function",
      });
    } else {
      // If there is a pattern, bind it to the parent container
      const pattern = node.childForFieldName("pattern");

      if (pattern) {
        pattern.descendantsOfType("lower_pattern").forEach((lowerPattern) => {
          container.set(lowerPattern.text, {
            node: lowerPattern,
            type: "Function", // This isn't a good type
          });
        });
      }
    }

    // Bind the rest of the container
    bindContainer(node);
  }

  function bindFunctionDeclarationLeft(node: SyntaxNode): void {
    node.descendantsOfType("lower_pattern").forEach((lowerPattern) => {
      container.set(lowerPattern.text, {
        node: lowerPattern,
        type: "FunctionParameter",
      });
    });
  }

  function bindTypeDeclaration(node: SyntaxNode): void {
    const name = node.childForFieldName("name");

    if (name) {
      container.set(name.text, { node, type: "Type" });
    }

    // Union variants get bound to the parent container
    TreeUtils.findAllNamedChildrenOfType("union_variant", node)?.forEach(
      (unionVariant) => {
        const name = unionVariant.childForFieldName("name");

        if (name) {
          container.set(name.text, {
            node: unionVariant,
            type: "UnionConstructor",
          });
        }
      },
    );

    // Bind type variables
    bindContainer(node);
  }

  function bindTypeAliasDeclaration(node: SyntaxNode): void {
    const name = node.childForFieldName("name");

    if (name) {
      container.set(name.text, { node, type: "TypeAlias" });
    }

    // Bind type variables
    bindContainer(node);
  }

  function bindLowerTypeName(node: SyntaxNode): void {
    container.set(node.text, { node, type: "TypeVariable" });
  }

  function bindPortAnnotation(node: SyntaxNode): void {
    // TODO: Use field
    const name = TreeUtils.findFirstNamedChildOfType(
      "lower_case_identifier",
      node,
    );

    if (name) {
      container.set(name.text, { node, type: "Port" });
    }
  }

  function bindPattern(node: SyntaxNode): void {
    node.descendantsOfType("lower_pattern").forEach((lowerPattern) => {
      switch (parent.type) {
        case "anonymous_function_expr":
          container.set(lowerPattern.text, {
            node: lowerPattern,
            type: "AnonymousFunctionParameter",
          });
          break;
        case "case_of_branch":
          container.set(lowerPattern.text, {
            node: lowerPattern,
            type: "CasePattern",
          });
          break;
      }
    });
  }
}
