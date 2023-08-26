/* eslint-disable @typescript-eslint/naming-convention */
import { SyntaxNode } from "web-tree-sitter";
import { TreeUtils } from "../common/util/treeUtils";
import {
  Expression,
  EValueDeclaration,
  mapSyntaxNodeToExpression,
  ETypeAliasDeclaration,
  ETypeDeclaration,
  EUnionVariant,
  EPortAnnotation,
} from "./utils/expressionTree";
import { IProgram } from "./program";
import { container } from "tsyringe";
import { Connection } from "vscode-languageserver";
import {
  Type,
  TUnknown,
  InferenceScope,
  InferenceResult,
} from "./typeInference";
import { ISourceFile } from "./forest";
import { IImport, Imports } from "./imports";
import { TypeRenderer } from "./typeRenderer";
import { performance } from "perf_hooks";
import { bindTreeContainer, ISymbol } from "./binder";
import { Sequence } from "../common/util/sequence";
import { Utils } from "../common/util/utils";
import { TypeExpression } from "./typeExpression";
import type { ICancellationToken } from "../common/cancellation";
import { Diagnostic, Diagnostics, error } from "./diagnostics";

export let bindTime = 0;
export function resetBindTime(): void {
  bindTime = 0;
}

export interface DefinitionResult {
  symbol?: ISymbol;
  diagnostics: Diagnostic[];
}

class DiagnosticsCollection extends Map<string, Diagnostic[]> {
  public add(diagnostic: Diagnostic): void {
    let diagnostics = super.get(diagnostic.uri);

    if (!diagnostics) {
      diagnostics = [];
      super.set(diagnostic.uri, diagnostics);
    }

    diagnostics.push(diagnostic);
  }

  public get(uri: string): Diagnostic[] {
    return super.get(uri) ?? [];
  }
}

export interface TypeChecker {
  findType: (node: SyntaxNode) => Type;
  findDefinition: (
    node: SyntaxNode,
    sourceFile: ISourceFile,
  ) => DefinitionResult;
  findDefinitionShallow: (
    node: SyntaxNode,
    sourceFile: ISourceFile,
  ) => DefinitionResult;
  getAllImports: (sourceFile: ISourceFile) => Imports;
  getImportingModules: (
    sourceFile: ISourceFile,
    directImportOnly?: boolean,
  ) => ISourceFile[];
  getQualifierForName: (
    sourceFile: ISourceFile,
    module: string,
    name: string,
  ) => string;
  typeToString: (t: Type, sourceFile?: ISourceFile) => string;
  getDiagnostics: (
    sourceFile: ISourceFile,
    cancellationToken?: ICancellationToken,
  ) => Diagnostic[];
  getDiagnosticsAsync: (
    sourceFile: ISourceFile,
    token?: ICancellationToken,
    cancelCallback?: () => boolean,
  ) => Promise<Diagnostic[]>;
  getSuggestionDiagnostics: (
    sourceFile: ISourceFile,
    cancellationToken?: ICancellationToken,
  ) => Diagnostic[];
  findImportModuleNameNodes: (
    moduleNameOrAlias: string,
    sourceFile: ISourceFile,
  ) => SyntaxNode[];
  getSymbolsInScope(node: SyntaxNode, sourceFile: ISourceFile): ISymbol[];
}

export function createTypeChecker(program: IProgram): TypeChecker {
  const imports = new Map<string, Imports>();
  let importModuleGraph: Map<string, ISourceFile[]>;

  const diagnostics = new DiagnosticsCollection();
  const suggestionDiagnostics = new DiagnosticsCollection();
  let cancellationToken: ICancellationToken | undefined;

  const checkedNodes = new Set<number>();

  const start = performance.now();
  program.getSourceFiles().forEach((sourceFile) => {
    bindTreeContainer(sourceFile);
  });
  bindTime = performance.now() - start;

  const typeChecker: TypeChecker = {
    findType,
    findDefinition,
    findDefinitionShallow,
    getAllImports,
    getImportingModules,
    getQualifierForName,
    typeToString,
    getDiagnostics,
    getDiagnosticsAsync,
    getSuggestionDiagnostics,
    findImportModuleNameNodes,
    getSymbolsInScope,
  };

  return typeChecker;

  function findType(node: SyntaxNode): Type {
    try {
      const declaration = mapSyntaxNodeToExpression(
        TreeUtils.findParentOfType("value_declaration", node, true),
      );

      const uri = node.tree.uri;

      const findTypeOrParentType = (
        expr: SyntaxNode | undefined,
        inferenceResult: InferenceResult,
      ): Type | undefined => {
        const found = expr
          ? inferenceResult.expressionTypes.get(expr as Expression)
          : undefined;

        if (found) {
          return found;
        }

        // Check if the parent is the same text and position
        if (
          expr &&
          expr.text === expr.parent?.text &&
          expr.startIndex === expr.parent?.startIndex &&
          expr.endIndex === expr.parent?.endIndex
        ) {
          return findTypeOrParentType(expr.parent, inferenceResult);
        }
      };

      if (declaration && declaration.nodeType === "ValueDeclaration") {
        const inferenceResult = InferenceScope.valueDeclarationInference(
          declaration,
          uri,
          program,
          new Set<EValueDeclaration>(),
        );

        if (node?.type === "function_declaration_left") {
          const declaration = TreeUtils.findParentOfType(
            "value_declaration",
            node,
          );

          if (declaration) {
            return (
              inferenceResult.expressionTypes.get(declaration as Expression) ??
              inferenceResult.type
            );
          } else {
            return TUnknown;
          }
        } else if (node.type === "value_declaration") {
          return (
            inferenceResult.expressionTypes.get(node as Expression) ??
            inferenceResult.type
          );
        }

        return findTypeOrParentType(node, inferenceResult) ?? TUnknown;
      }

      const typeAliasDeclaration = mapSyntaxNodeToExpression(
        TreeUtils.findParentOfType("type_alias_declaration", node),
      );

      if (
        typeAliasDeclaration &&
        typeAliasDeclaration.nodeType === "TypeAliasDeclaration"
      ) {
        const inferenceResult = TypeExpression.typeAliasDeclarationInference(
          typeAliasDeclaration,
          program,
        );

        if (node.type === "type_alias_declaration") {
          return inferenceResult.type;
        }

        return findTypeOrParentType(node, inferenceResult) ?? TUnknown;
      }

      const unionVariant =
        node.type === "union_variant"
          ? mapSyntaxNodeToExpression(node)
          : undefined;

      if (unionVariant && unionVariant.nodeType === "UnionVariant") {
        return TypeExpression.unionVariantInference(unionVariant, program).type;
      }

      const typeDeclaration = mapSyntaxNodeToExpression(
        TreeUtils.findParentOfType("type_declaration", node),
      );

      if (typeDeclaration && typeDeclaration.nodeType === "TypeDeclaration") {
        const inferenceResult = TypeExpression.typeDeclarationInference(
          typeDeclaration,
          program,
        );

        return findTypeOrParentType(node, inferenceResult) ?? TUnknown;
      }

      const portAnnotation = mapSyntaxNodeToExpression(node);

      if (portAnnotation && portAnnotation.nodeType === "PortAnnotation") {
        return TypeExpression.portAnnotationInference(portAnnotation, program)
          .type;
      }

      return TUnknown;
    } catch (error) {
      const connection = container.resolve<Connection>("Connection");
      connection.console.warn(`Error while trying to infer a type. ${error}`);
      return TUnknown;
    }
  }

  function getDiagnostics(
    sourceFile: ISourceFile,
    token?: ICancellationToken,
  ): Diagnostic[] {
    try {
      cancellationToken = token;

      checkNode(sourceFile.tree.rootNode);

      return diagnostics.get(sourceFile.uri);
    } finally {
      cancellationToken = undefined;
    }
  }

  function getDiagnosticsAsync(
    sourceFile: ISourceFile,
    token?: ICancellationToken,
    cancelCallback?: () => boolean,
  ): Promise<Diagnostic[]> {
    cancellationToken = token;

    return new Promise((resolve, reject) => {
      const children = sourceFile.tree.rootNode.children;
      let index = 0;

      const goNext = (): void => {
        index++;
        if (children.length > index) {
          setImmediate(checkOne);
        } else {
          cancellationToken = undefined;
          resolve(diagnostics.get(sourceFile.uri));
        }
      };

      const checkOne = (): void => {
        if (cancelCallback && cancelCallback()) {
          reject();
          return;
        }

        try {
          checkNode(children[index]);
        } catch {
          cancellationToken = undefined;
          reject();
          return;
        }

        goNext();
      };

      checkOne();
    });
  }

  function getSuggestionDiagnostics(
    sourceFile: ISourceFile,
    token?: ICancellationToken,
  ): Diagnostic[] {
    try {
      cancellationToken = token;

      checkNode(sourceFile.tree.rootNode);

      return suggestionDiagnostics.get(sourceFile.uri);
    } finally {
      cancellationToken = undefined;
    }
  }

  function getAllImports(sourceFile: ISourceFile): Imports {
    const cached = imports.get(sourceFile.uri);

    if (cached) {
      return cached;
    }

    const allImports = Imports.getImports(sourceFile, program);
    allImports.getDiagnostics().forEach((diagnostic) => {
      diagnostics.add(diagnostic);
    });

    imports.set(sourceFile.uri, allImports);
    return allImports;
  }

  function getImportingModules(
    sourceFile: ISourceFile,
    directImportOnly?: boolean,
  ): ISourceFile[] {
    if (!importModuleGraph) {
      importModuleGraph = new Map<string, ISourceFile[]>();

      program.getSourceFiles().forEach((sourceFile) => {
        if (sourceFile.writeable) {
          getAllImports(sourceFile)
            .getModules()
            .forEach((module) => {
              const existingGraph = importModuleGraph.get(
                module.fromModule.uri,
              );

              if (existingGraph) {
                existingGraph.push(sourceFile);
              } else {
                importModuleGraph.set(module.fromModule.uri, [sourceFile]);
              }
            });
        }
      });
    }

    if (directImportOnly) {
      return importModuleGraph.get(sourceFile.uri) ?? [];
    }

    const getAllDescendantImports = (source: ISourceFile): ISourceFile[] => {
      const imports = importModuleGraph.get(source.uri) ?? [];

      imports.slice(0).forEach((directImport) => {
        imports.push(...getAllDescendantImports(directImport));
      });

      return imports;
    };

    return getAllDescendantImports(sourceFile);
  }

  function findImport(
    sourceFile: ISourceFile,
    name: string,
    type?: "Var" | "Type" | "Constructor" | "Module",
  ): IImport[] {
    const allImports = getAllImports(sourceFile);
    if (type === "Type") {
      return allImports.getType(name);
    } else if (type === "Constructor") {
      return allImports.getConstructor(name);
    } else if (type === "Module") {
      const module = allImports.getModule(name);
      if (module) {
        return [module];
      } else {
        return [];
      }
    } else if (type === "Var") {
      return allImports.getVar(name);
    }

    let result = allImports.getVar(name);

    if (result.length > 0) {
      return result;
    }

    result = allImports.getType(name);

    if (result.length > 0) {
      return result;
    }

    return allImports.getConstructor(name);
  }

  function findDefinition(
    nodeAtPosition: SyntaxNode,
    sourceFile: ISourceFile,
  ): DefinitionResult {
    const definition = findDefinitionShallow(nodeAtPosition, sourceFile);

    if (
      definition.symbol?.node?.type === "lower_pattern" &&
      definition.symbol.node.firstNamedChild
    ) {
      const innerDefinition = findDefinitionShallow(
        definition.symbol.node.firstNamedChild,
        sourceFile,
      );

      if (innerDefinition.symbol) {
        return innerDefinition;
      }
    }

    return definition;
  }

  function findDefinitionShallow(
    nodeAtPosition: SyntaxNode,
    sourceFile: ISourceFile,
  ): DefinitionResult {
    const nodeText = nodeAtPosition.text;
    const nodeParent = nodeAtPosition.parent;

    if (!nodeParent) {
      return { diagnostics: [] };
    }

    const nodeParentType = nodeParent.type;

    const rootSymbols = sourceFile.symbolLinks?.get(sourceFile.tree.rootNode);

    if (
      nodeParentType === "upper_case_qid" &&
      nodeParent.previousNamedSibling?.type === "module"
    ) {
      const moduleNode = nodeParent.parent;

      if (moduleNode) {
        return {
          symbol: { name: moduleNode.text, node: moduleNode, type: "Module" },
          diagnostics: [],
        };
      }
    } else if (
      nodeParentType === "upper_case_qid" &&
      nodeParent.previousNamedSibling?.type === "import"
    ) {
      const upperCaseQid = nodeParent;
      const upperCaseQidText = upperCaseQid.text;

      return {
        symbol: findImport(sourceFile, upperCaseQidText, "Module")[0],
        diagnostics: [],
      };
    } else if (
      (nodeParentType === "exposed_value" &&
        nodeParent.parent?.parent?.type === "module_declaration") ||
      nodeParentType === "type_annotation" ||
      nodeParentType === "port_annotation"
    ) {
      const symbol = rootSymbols?.get(nodeText);

      if (symbol && (symbol.type === "Function" || symbol.type === "Port")) {
        return {
          symbol,
          diagnostics: [],
        };
      }

      // This is for values, with type annotation, but *inside* a let.
      if (nodeParent.nextNamedSibling?.type === "value_declaration") {
        // A value_declaration with a type annotation got it's type_annotation node
        // added. So, we confirm the value_declaration does indeed follow, and return
        // type node text with value declaration node.
        return {
          symbol: {
            name: nodeText,
            node: nodeParent.nextNamedSibling.children[0], // the function_declaration_left
            type: "Function",
          },
          diagnostics: [],
        };
      }
    } else if (
      (nodeParentType === "exposed_type" &&
        nodeParent.parent?.parent?.type === "module_declaration") ||
      nodeAtPosition.previousNamedSibling?.type === "type" ||
      nodeAtPosition.previousNamedSibling?.type === "alias"
    ) {
      return {
        symbol: rootSymbols?.get(
          nodeText,
          (symbol) => symbol.type === "Type" || symbol.type === "TypeAlias",
        ),
        diagnostics: [],
      };
    } else if (
      (nodeParentType === "exposed_value" ||
        nodeParentType === "exposed_type") &&
      nodeParent.parent?.parent?.type === "import_clause"
    ) {
      const moduleName =
        nodeParent.parent?.parent.childForFieldName("moduleName")?.text ?? "";
      const imports = findImport(
        sourceFile,
        nodeText,
        nodeParentType === "exposed_value" ? "Var" : "Type",
      ).filter((imp) => imp.fromModule.name === moduleName);

      return {
        symbol: imports[0],
        diagnostics: [],
      };
    } else if (nodeParentType === "union_variant") {
      const definitionNode = nodeParent;
      return {
        symbol: {
          name: definitionNode.text,
          node: definitionNode,
          type: "UnionConstructor",
        },
        diagnostics: [],
      };
    } else if (nodeParent && nodeParent.type === "upper_case_qid") {
      const upperCaseQid = nodeParent;
      const upperCaseQidText = upperCaseQid.text;

      // Usage is either a type or a constructor
      // A type can only be used as a type
      // A union variant can only be used as a constructor or as a pattern
      // A type alias can be used as both a type and a constructor
      const isTypeUsage =
        TreeUtils.findParentOfType("type_ref", upperCaseQid) ||
        upperCaseQid.parent?.type === "exposed_type";
      const isConstructorUsage = upperCaseQid.parent?.type === "value_expr";

      const localSymbols =
        rootSymbols
          ?.getAll(upperCaseQidText)
          ?.filter((symbol) =>
            isTypeUsage
              ? symbol.type === "Type" || symbol.type === "TypeAlias"
              : isConstructorUsage
              ? symbol.type === "UnionConstructor" ||
                (symbol.type === "TypeAlias" && symbol.constructors?.length)
              : symbol.type === "UnionConstructor",
          ) ?? [];

      if (localSymbols.length > 0) {
        return {
          symbol: localSymbols[0],
          diagnostics: [],
        };
      }

      const imports = findImport(
        sourceFile,
        upperCaseQidText,
        isTypeUsage ? "Type" : "Constructor",
      );

      if (imports.length > 0) {
        return {
          symbol: imports.length === 1 ? imports[0] : undefined,
          diagnostics:
            imports.length > 1
              ? [
                  error(
                    upperCaseQid,
                    isTypeUsage
                      ? Diagnostics.AmbiguousType
                      : Diagnostics.AmbiguousVariant,
                    upperCaseQidText,
                  ),
                ]
              : [],
        };
      }

      // Make sure the next node is a dot, or else it isn't a Module
      if (TreeUtils.nextNode(nodeAtPosition)?.type === "dot") {
        const endPos = upperCaseQidText.indexOf(nodeText) + nodeText.length;

        // There may be multiple imports with the same name/alias, but we just go to the first one
        const moduleNameOrAlias = nodeParent.text.substring(0, endPos);
        const moduleName =
          findImportModuleNameNodes(moduleNameOrAlias, sourceFile)[0]?.text ??
          moduleNameOrAlias;

        const moduleImport = findImport(sourceFile, moduleName, "Module")[0];

        if (moduleImport) {
          return {
            symbol: moduleImport,
            diagnostics: [],
          };
        }
      }

      // There may be multiple imports with the same name/alias, but we just go to the first one
      const moduleImport = findImport(
        sourceFile,
        findImportModuleNameNodes(upperCaseQidText, sourceFile)[0]?.text ??
          upperCaseQidText,
        "Module",
      )[0];

      if (moduleImport) {
        return {
          symbol: moduleImport,
          diagnostics: [],
        };
      }
    } else if (
      nodeParentType === "lower_pattern" &&
      nodeParent.parent?.type === "record_pattern"
    ) {
      const type = findType(nodeParent.parent);
      return {
        symbol: TreeUtils.findFieldReference(type, nodeText),
        diagnostics: [],
      };
    } else if (
      nodeAtPosition.type === "lower_case_identifier" &&
      nodeParentType === "function_declaration_left" &&
      nodeParent.parent?.type === "value_declaration"
    ) {
      // The function name should resolve to itself
      if (nodeParent.firstNamedChild?.text === nodeText) {
        return {
          symbol: { name: nodeParent.text, node: nodeParent, type: "Function" },
          diagnostics: [],
        };
      }
    } else if (
      nodeParentType === "value_qid" ||
      nodeParentType === "lower_pattern" ||
      nodeParentType === "record_base_identifier"
    ) {
      let nodeAtPositionText = nodeText;
      if (nodeParentType === "value_qid") {
        nodeAtPositionText = nodeParent.text;
      }

      // Traverse the parents and find a binding
      // For operator functions, there are two bindings:
      // The infix declaration and the function
      // Never resolve to the infix declaration
      const localBinding = new Sequence(
        nodeAtPosition,
        (node) => node.parent ?? undefined,
      )
        .map(
          (node) =>
            sourceFile.symbolLinks
              ?.get(node)
              ?.get(
                nodeAtPositionText,
                (s) => s.node.type !== "infix_declaration",
              ),
        )
        .find(Utils.notUndefined);

      if (localBinding) {
        return {
          symbol: localBinding,
          diagnostics: [],
        };
      } else {
        const nodeParentText = nodeParent.text;

        // Get the full module name and handle an import alias if there is one
        if (nodeAtPosition.type === "upper_case_identifier") {
          const moduleNameOrAlias =
            TreeUtils.findAllNamedChildrenOfType(
              "upper_case_identifier",
              nodeParent,
            )
              ?.map((node) => node.text)
              .join(".") ?? "";
          const moduleName =
            findImportModuleNameNodes(moduleNameOrAlias, sourceFile)[0]?.text ??
            moduleNameOrAlias;

          const moduleImport = findImport(sourceFile, moduleName, "Module")[0];

          if (moduleImport) {
            return {
              symbol: moduleImport,
              diagnostics: [],
            };
          }
        }

        const imports = findImport(sourceFile, nodeParentText, "Var");

        return {
          symbol: imports.length === 1 ? imports[0] : undefined,
          diagnostics:
            imports.length > 1
              ? [error(nodeParent, Diagnostics.AmbiguousVar, nodeParentText)]
              : [],
        };
      }
    } else if (nodeAtPosition.type === "operator_identifier") {
      const definitionNode = TreeUtils.findOperator(sourceFile, nodeText);
      if (definitionNode) {
        const result: DefinitionResult = {
          symbol: {
            name: definitionNode.text,
            node: definitionNode,
            type: "Operator",
          },
          diagnostics: [],
        };
        return result;
      } else {
        const operatorImport = findImport(sourceFile, nodeText, "Var")[0];

        if (operatorImport) {
          const result: DefinitionResult = {
            symbol: operatorImport,
            diagnostics: [],
          };
          return result;
        }
      }
    } else if (nodeParentType === "field_access_expr") {
      let target = nodeParent?.childForFieldName("target");

      // Adjust for parenthesis expr. Will need to change when we handle it better in inference
      if (target?.type === "parenthesized_expr") {
        target = target.firstNamedChild;
      }

      if (target) {
        const type = findType(target);
        return {
          symbol: TreeUtils.findFieldReference(type, nodeText),
          diagnostics: [],
        };
      }
    } else if (
      nodeAtPosition.type === "lower_case_identifier" &&
      nodeParentType === "field" &&
      nodeParent.parent?.type === "record_expr"
    ) {
      const type = findType(nodeParent.parent);
      return {
        symbol: TreeUtils.findFieldReference(type, nodeText),
        diagnostics: [],
      };
    } else if (
      nodeAtPosition.type === "lower_case_identifier" &&
      nodeParentType === "field_accessor_function_expr"
    ) {
      const type = findType(nodeParent);

      if (type.nodeType === "Function") {
        const paramType = type.params[0];

        return {
          symbol: TreeUtils.findFieldReference(paramType, nodeText),
          diagnostics: [],
        };
      }
    } else if (
      nodeAtPosition.type === "lower_case_identifier" &&
      nodeParentType === "field_type"
    ) {
      return {
        symbol: { name: nodeParent.text, node: nodeParent, type: "FieldType" },
        diagnostics: [],
      };
    } else if (
      nodeAtPosition.type === "upper_case_identifier" &&
      nodeParentType === "ERROR"
    ) {
      let fullModuleName = nodeText;

      // Get fully qualified module name
      // Ex: nodeText is Attributes, we need to get Html.Attributes manually
      let currentNode = nodeAtPosition.previousNamedSibling;
      while (
        currentNode?.type === "dot" &&
        currentNode.previousNamedSibling?.type === "upper_case_identifier"
      ) {
        fullModuleName = `${currentNode.previousNamedSibling.text}.${fullModuleName}`;
        currentNode = currentNode.previousNamedSibling.previousNamedSibling;
      }

      const moduleImport = findImport(
        sourceFile,
        findImportModuleNameNodes(fullModuleName, sourceFile)[0]?.text ??
          fullModuleName,
        "Module",
      )[0];

      if (moduleImport) {
        return {
          symbol: moduleImport,
          diagnostics: [],
        };
      }
    }

    const parentType =
      TreeUtils.findParentOfType("type_annotation", nodeAtPosition) ??
      TreeUtils.findParentOfType("type_declaration", nodeAtPosition) ??
      TreeUtils.findParentOfType("type_alias_declaration", nodeAtPosition);

    if (parentType?.type === "type_annotation") {
      const ancestorDeclarations = TreeUtils.getAllAncestorsOfType(
        "value_declaration",
        parentType,
      );

      const allAnnotations = [
        ...ancestorDeclarations
          .map((n) => TreeUtils.getTypeAnnotation(n))
          .filter((n) => !!n)
          .reverse(),
        parentType,
      ];

      const callback = (annotation: SyntaxNode | undefined): SyntaxNode[] =>
        annotation
          ? TreeUtils.descendantsOfType(annotation, "type_variable")
          : [];

      const allTypeVariables: SyntaxNode[] = allAnnotations.flatMap(callback);

      const firstMatching = allTypeVariables.find((t) => t.text === nodeText);

      if (firstMatching) {
        return {
          symbol: {
            name: firstMatching.text,
            node: firstMatching,
            type: "TypeVariable",
          },
          diagnostics: [],
        };
      }
    } else if (parentType) {
      const allTypeNames = TreeUtils.findAllNamedChildrenOfType(
        "lower_type_name",
        parentType,
      );

      const firstMatching = allTypeNames?.find((t) => t.text === nodeText);

      if (firstMatching) {
        return {
          symbol: {
            name: firstMatching.text,
            node: firstMatching,
            type: "TypeVariable",
          },
          diagnostics: [],
        };
      }
    }

    return { diagnostics: [] };
  }

  function getQualifierForName(
    sourceFile: ISourceFile,
    module: string,
    name: string,
  ): string {
    if (findImport(sourceFile, name).length > 0) {
      return "";
    }

    if (module === "List" && name === "List") {
      return "";
    }

    const moduleImport = findImport(sourceFile, module, "Module")[0]
      ?.importNode;

    if (!moduleImport) {
      return "";
    }

    const asClause = TreeUtils.findFirstNamedChildOfType(
      "as_clause",
      moduleImport,
    );

    if (asClause) {
      return `${asClause?.lastNamedChild?.text ?? module}.`;
    }

    return `${module}.`;
  }

  function typeToString(t: Type, sourceFile?: ISourceFile): string {
    return new TypeRenderer(typeChecker, sourceFile).render(t);
  }

  /**
   * Get the module name node if the name is an alias
   */
  function findImportModuleNameNodes(
    moduleNameOrAlias: string,
    sourceFile: ISourceFile,
  ): SyntaxNode[] {
    // This will find an import based on module name only, not alias
    const moduleImport = getAllImports(sourceFile)
      .getModule(moduleNameOrAlias)
      ?.importNode?.childForFieldName("moduleName");

    // This will not find a module by name if it is aliased
    const moduleOrAliasImports =
      sourceFile.symbolLinks
        ?.get(sourceFile.tree.rootNode)
        ?.getAll(moduleNameOrAlias)
        ?.filter((s) => s.type === "Import")
        .map((s) => s.node.childForFieldName("moduleName"))
        .filter(Utils.notUndefinedOrNull) ?? [];

    if (
      moduleImport &&
      moduleOrAliasImports.every((n) => n.id !== moduleImport.id)
    ) {
      return [moduleImport, ...moduleOrAliasImports];
    }

    return moduleOrAliasImports;
  }

  function getSymbolsInScope(
    node: SyntaxNode,
    sourceFile: ISourceFile,
  ): ISymbol[] {
    const symbols: ISymbol[] = [];

    let targetScope: SyntaxNode | null = node;
    while (targetScope != null) {
      sourceFile.symbolLinks
        ?.get(targetScope)
        ?.forEach((symbol) => symbols.push(symbol));
      targetScope = targetScope.parent;
    }

    return symbols;
  }

  function checkNode(node: SyntaxNode): void {
    if (checkedNodes.has(node.id)) {
      return;
    }

    cancellationToken?.throwIfCancellationRequested();

    switch (node.type) {
      case "file":
        node.children.forEach(checkNode);
        break;
      case "value_declaration":
        checkValueDeclaration(node);
        break;
      case "import_clause":
        checkImportClause(node);
        break;
      case "type_alias_declaration":
        checkTypeAliasDeclaration(node);
        break;
      case "type_declaration":
        checkTypeDeclaration(node);
        break;
      case "union_variant":
        checkUnionVariant(node);
        break;
      case "port_annotation":
        checkPortAnnotation(node);
        break;
    }

    checkedNodes.add(node.id);
  }

  function checkValueDeclaration(valueDeclaration: SyntaxNode): void {
    const declaration = mapSyntaxNodeToExpression(
      valueDeclaration,
    ) as EValueDeclaration;

    const result = InferenceScope.valueDeclarationInference(
      declaration,
      valueDeclaration.tree.uri,
      program,
      new Set(),
      /* recursionAllowed */ false,
      cancellationToken,
    );
    result.diagnostics.forEach((diagnostic) => diagnostics.add(diagnostic));

    if (!declaration.typeAnnotation) {
      const typeString: string = typeToString(
        result.type,
        getSourceFileOfNode(declaration),
      );

      if (
        typeString &&
        typeString !== "unknown" &&
        declaration.firstNamedChild?.firstNamedChild
      ) {
        suggestionDiagnostics.add(
          error(
            declaration.firstNamedChild.firstNamedChild,
            Diagnostics.MissingTypeAnnotation,
            typeString,
          ),
        );
      }
    }
  }

  function checkImportClause(importClause: SyntaxNode): void {
    const moduleNameNode = importClause.childForFieldName("moduleName");

    if (moduleNameNode) {
      const moduleName = moduleNameNode.text;
      const sourceFile = getSourceFileOfNode(importClause);
      if (
        !program.getSourceFileOfImportableModule(sourceFile, moduleName) &&
        !program.getKernelSourceFileOfImportableModule(sourceFile, moduleName)
      ) {
        diagnostics.add(
          error(moduleNameNode, Diagnostics.ImportMissing, moduleName),
        );
      }
    }
  }

  function checkTypeAliasDeclaration(typeAliasDeclaration: SyntaxNode): void {
    TypeExpression.typeAliasDeclarationInference(
      mapSyntaxNodeToExpression(typeAliasDeclaration) as ETypeAliasDeclaration,
      program,
    ).diagnostics.forEach((diagnostic) => diagnostics.add(diagnostic));
  }

  function checkTypeDeclaration(typeDeclaration: SyntaxNode): void {
    TypeExpression.typeDeclarationInference(
      mapSyntaxNodeToExpression(typeDeclaration) as ETypeDeclaration,
      program,
    ).diagnostics.forEach((diagnostic) => diagnostics.add(diagnostic));

    // Need to check union variants
    typeDeclaration.children.forEach(checkNode);
  }

  function checkUnionVariant(unionVariant: SyntaxNode): void {
    TypeExpression.unionVariantInference(
      mapSyntaxNodeToExpression(unionVariant) as EUnionVariant,
      program,
    ).diagnostics.forEach((diagnostic) => diagnostics.add(diagnostic));
  }

  function checkPortAnnotation(portAnnotation: SyntaxNode): void {
    TypeExpression.portAnnotationInference(
      mapSyntaxNodeToExpression(portAnnotation) as EPortAnnotation,
      program,
    ).diagnostics.forEach((diagnostic) => diagnostics.add(diagnostic));
  }

  function getSourceFileOfNode(node: SyntaxNode): ISourceFile {
    const sourceFile = program.getSourceFile(node.tree.uri);

    if (!sourceFile) {
      throw new Error(`Can't find sourceFile by uri "${node.tree.uri}"`);
    } else {
      return sourceFile;
    }
  }
}
