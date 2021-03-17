import { ISourceFile } from "./forest";
import { SyntaxNode } from "web-tree-sitter";
import { MultiMap } from "../util/multiMap";
import { NodeType, TreeUtils } from "../util/treeUtils";
import { Utils } from "../util/utils";
import { SyntaxNodeMap } from "./utils/syntaxNodeMap";
import { Diagnostics, error } from "./diagnostics";
import { Imports } from "./imports";

export type SymbolMap = MultiMap<string, ISymbol>;
function createSymbolMap(): SymbolMap {
  return new MultiMap<string, ISymbol>();
}

export type IExposing = Map<string, ISymbol>;

export interface ISymbol {
  name: string;
  node: SyntaxNode;
  type: NodeType;
  constructors?: {
    name: string;
    node: SyntaxNode;
    type: "UnionConstructor" | "TypeAlias";
  }[];
}

export function bindTreeContainer(sourceFile: ISourceFile): void {
  if (sourceFile.symbolLinks) {
    return;
  }

  const symbolLinks = new SyntaxNodeMap<SyntaxNode, SymbolMap>();
  const nonShadowableNames = new Set<string>();
  let container: SymbolMap;
  let parent: SyntaxNode;
  const treeCursor = sourceFile.tree.walk();

  bind();
  sourceFile.symbolLinks = symbolLinks;
  sourceFile.nonShadowableNames = nonShadowableNames;

  // Bind exposing must happen after symbolLinks is bound
  bindExposing();

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
      case "infix_declaration":
        bindInfixDeclaration(node);
        break;
      case "pattern":
        bindPattern(node);
        break;
      case "import_clause":
        bindImportClause(node);
        break;
      case "ERROR":
        sourceFile.parseDiagnostics.push(error(node, Diagnostics.Parsing));
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

    if (node.type === "file") {
      bindDefaultImports();
    }

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
      const functionName = functionDeclarationLeft.firstChild.text;
      container.set(functionName, {
        name: functionName,
        node: functionDeclarationLeft,
        type: "Function",
      });

      // Add to nonShadowableNames if it is top level
      if (node.parent?.type === "file") {
        nonShadowableNames.add(functionDeclarationLeft.firstChild.text);
      }
    } else {
      // If there is a pattern, bind it to the parent container
      const pattern = node.childForFieldName("pattern");

      if (pattern) {
        pattern.descendantsOfType("lower_pattern").forEach((lowerPattern) => {
          container.set(lowerPattern.text, {
            name: lowerPattern.text,
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
        name: lowerPattern.text,
        node: lowerPattern,
        type: "FunctionParameter",
      });
    });
  }

  function bindTypeDeclaration(node: SyntaxNode): void {
    const unionVariants =
      TreeUtils.findAllNamedChildrenOfType("union_variant", node)
        ?.map((unionVariant) => {
          const name = unionVariant.childForFieldName("name");

          if (name) {
            return {
              name: name.text,
              node: unionVariant,
              type: "UnionConstructor" as const,
            };
          }
        })
        .filter(Utils.notUndefined.bind(bindExposing)) ?? [];

    // Union variants get bound to the parent container
    unionVariants.forEach((variant) => {
      container.set(variant.name, {
        ...variant,
        type: variant.type as NodeType,
      });
    });

    const name = node.childForFieldName("name");

    if (name) {
      container.set(name.text, {
        name: name.text,
        node,
        type: "Type",
        constructors: unionVariants,
      });
    }

    // Bind type variables
    bindContainer(node);
  }

  function bindTypeAliasDeclaration(node: SyntaxNode): void {
    const name = node.childForFieldName("name");

    if (name) {
      const isRecordConstructor =
        node.childForFieldName("typeExpression")?.children[0]?.type ===
        "record_type";

      container.set(name.text, {
        name: name.text,
        node,
        type: "TypeAlias",
        constructors: isRecordConstructor
          ? [{ name: name.text, node, type: "TypeAlias" }]
          : [],
      });
    }

    // Bind type variables
    bindContainer(node);
  }

  function bindLowerTypeName(node: SyntaxNode): void {
    container.set(node.text, { name: node.text, node, type: "TypeVariable" });
  }

  function bindPortAnnotation(node: SyntaxNode): void {
    // TODO: Use field
    const name = TreeUtils.findFirstNamedChildOfType(
      "lower_case_identifier",
      node,
    );

    if (name) {
      container.set(name.text, { name: name.text, node, type: "Port" });
    }
  }

  function bindInfixDeclaration(node: SyntaxNode): void {
    const operator = node.childForFieldName("operator");
    const name = node.lastNamedChild;
    if (operator && name) {
      container.set(operator.text, {
        name: operator.text,
        node,
        type: "Operator",
      });
      container.set(name.text, { name: name.text, node, type: "Operator" });
    }
  }

  function bindPattern(node: SyntaxNode): void {
    node.descendantsOfType("lower_pattern").forEach((lowerPattern) => {
      switch (parent.type) {
        case "anonymous_function_expr":
          container.set(lowerPattern.text, {
            name: lowerPattern.text,
            node: lowerPattern,
            type: "AnonymousFunctionParameter",
          });
          break;
        case "case_of_branch":
          container.set(lowerPattern.text, {
            name: lowerPattern.text,
            node: lowerPattern,
            type: "CasePattern",
          });
          break;
      }
    });
  }

  function bindDefaultImports(): void {
    Imports.getVirtualImports().forEach(bindImportClause);
  }

  function bindImportClause(node: SyntaxNode): void {
    const asClause = node.childForFieldName("asClause");

    let name;
    if (asClause) {
      name = asClause.childForFieldName("name");
    } else {
      name = node.childForFieldName("moduleName");
    }

    if (name) {
      container.set(name.text, { name: name.text, node, type: "Import" });
    }
  }

  function bindExposing(): void {
    const tree = sourceFile.tree;
    const exposed: IExposing = new Map<string, ISymbol>();
    const moduleDeclaration = TreeUtils.findModuleDeclaration(tree);
    if (moduleDeclaration) {
      const exposingList = moduleDeclaration.childForFieldName("exposing");
      if (exposingList) {
        const rootSymbols = symbolLinks.get(tree.rootNode);
        if (exposingList.childForFieldName("doubleDot")) {
          rootSymbols?.forEach((symbol) => {
            switch (symbol.type) {
              case "Function":
              case "TypeAlias":
              case "Type":
              case "Port":
                exposed.set(symbol.name, symbol);
                break;
            }
          });
        } else {
          const exposedOperators = TreeUtils.descendantsOfType(
            exposingList,
            "operator_identifier",
          );

          for (const value of exposedOperators) {
            const functionNode = TreeUtils.findOperator(sourceFile, value.text);

            if (functionNode) {
              exposed.set(value.text, {
                name: value.text,
                node: functionNode,
                type: "Operator",
              });
            } else {
              sourceFile.bindDiagnostics.push(
                error(
                  value,
                  Diagnostics.ExportNotFound,
                  "operator",
                  value.text,
                ),
              );
            }
          }

          TreeUtils.descendantsOfType(exposingList, "exposed_value")
            .map((a) => a)
            .forEach((exposedValue) => {
              const symbol = rootSymbols?.get(exposedValue.text);

              if (symbol) {
                exposed.set(exposedValue.text, symbol);
              } else {
                sourceFile.bindDiagnostics.push(
                  error(
                    exposedValue,
                    Diagnostics.ExportNotFound,
                    "value",
                    exposedValue.text,
                  ),
                );
              }
            });

          const exposedTypes = TreeUtils.descendantsOfType(
            exposingList,
            "exposed_type",
          );
          exposedTypes.forEach((exposedType) => {
            const doubleDot = TreeUtils.descendantsOfType(
              exposedType,
              "double_dot",
            );
            if (doubleDot.length > 0) {
              const name = TreeUtils.findFirstNamedChildOfType(
                "upper_case_identifier",
                exposedType,
              );

              if (name) {
                const symbol = rootSymbols?.get(
                  name.text,
                  (symbol) =>
                    symbol.type === "Type" || symbol.type === "TypeAlias",
                );
                if (symbol) {
                  if (symbol.type === "Type") {
                    exposed.set(name.text, symbol);
                  } else if (symbol.type === "TypeAlias") {
                    sourceFile.bindDiagnostics.push(
                      error(exposedType, Diagnostics.ExportOpenAlias),
                    );
                  }
                } else {
                  sourceFile.bindDiagnostics.push(
                    error(
                      exposedType,
                      Diagnostics.ExportNotFound,
                      "type",
                      exposedType.text,
                    ),
                  );
                }
              }
            } else {
              const symbol = rootSymbols?.get(
                exposedType.text,
                (symbol) =>
                  symbol.type === "Type" || symbol.type === "TypeAlias",
              );

              if (symbol) {
                exposed.set(
                  exposedType.text,
                  symbol.type === "Type"
                    ? { ...symbol, constructors: [] }
                    : symbol,
                );
              } else {
                sourceFile.bindDiagnostics.push(
                  error(
                    exposedType,
                    Diagnostics.ExportNotFound,
                    "type",
                    exposedType.text,
                  ),
                );
              }
            }
          });
        }
      }
    }

    sourceFile.exposing = exposed;
  }
}
