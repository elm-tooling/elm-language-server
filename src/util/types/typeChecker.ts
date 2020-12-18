/* eslint-disable @typescript-eslint/naming-convention */
import { SyntaxNode } from "web-tree-sitter";
import { flatMap, NodeType, TreeUtils } from "../treeUtils";
import {
  Expression,
  EValueDeclaration,
  mapSyntaxNodeToExpression,
  ETypeAliasDeclaration,
  ETypeDeclaration,
  EUnionVariant,
  EPortAnnotation,
} from "./expressionTree";
import { IElmWorkspace } from "../../elmWorkspace";
import { container } from "tsyringe";
import { Connection } from "vscode-languageserver";
import {
  Type,
  TUnknown,
  InferenceScope,
  InferenceResult,
} from "./typeInference";
import { ITreeContainer } from "../../forest";
import { IImport, Imports } from "../../imports";
import { TypeRenderer } from "./typeRenderer";
import { performance } from "perf_hooks";
import { bindTreeContainer } from "./binder";
import { Sequence } from "../sequence";
import { Utils } from "../utils";
import { TypeExpression } from "./typeExpression";
import { ICancellationToken } from "../../cancellation";
import { Diagnostic, Diagnostics, error } from "./diagnostics";
import { node } from "execa";

export let bindTime = 0;
export function resetBindTime(): void {
  bindTime = 0;
}

export interface DefinitionResult {
  node: SyntaxNode;
  uri: string;
  nodeType: NodeType;
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
    treeContainer: ITreeContainer,
  ) => DefinitionResult | undefined;
  findDefinitionShallow: (
    node: SyntaxNode,
    treeContainer: ITreeContainer,
  ) => DefinitionResult | undefined;
  getAllImports: (treeContainer: ITreeContainer) => Imports;
  getQualifierForName: (
    treeContainer: ITreeContainer,
    module: string,
    name: string,
  ) => string | undefined;
  typeToString: (t: Type, treeContainer?: ITreeContainer) => string;
  getDiagnostics: (
    treeContainer: ITreeContainer,
    cancellationToken?: ICancellationToken,
  ) => Diagnostic[];
  getDiagnosticsAsync: (
    treeContainer: ITreeContainer,
    token?: ICancellationToken,
    cancelCallback?: () => boolean,
  ) => Promise<Diagnostic[]>;
  getSuggestionDiagnostics: (
    treeContainer: ITreeContainer,
    cancellationToken?: ICancellationToken,
  ) => Diagnostic[];
  findImportModuleNameNode: (
    moduleNameOrAlias: string,
    treeContainer: ITreeContainer,
  ) => SyntaxNode | undefined;
}

export function createTypeChecker(workspace: IElmWorkspace): TypeChecker {
  const forest = workspace.getForest();
  const imports = new Map<string, Imports>();

  const diagnostics = new DiagnosticsCollection();
  const suggestionDiagnostics = new DiagnosticsCollection();
  let cancellationToken: ICancellationToken | undefined;

  const checkedNodes = new Set<number>();

  const start = performance.now();
  forest.treeMap.forEach((treeContainer) => {
    bindTreeContainer(treeContainer);
  });
  bindTime = performance.now() - start;

  const typeChecker: TypeChecker = {
    findType,
    findDefinition,
    findDefinitionShallow,
    getAllImports,
    getQualifierForName,
    typeToString,
    getDiagnostics,
    getDiagnosticsAsync,
    getSuggestionDiagnostics,
    findImportModuleNameNode,
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
          workspace,
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
          workspace,
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
        return TypeExpression.unionVariantInference(unionVariant, workspace)
          .type;
      }

      const typeDeclaration = mapSyntaxNodeToExpression(
        TreeUtils.findParentOfType("type_declaration", node),
      );

      if (typeDeclaration && typeDeclaration.nodeType === "TypeDeclaration") {
        const inferenceResult = TypeExpression.typeDeclarationInference(
          typeDeclaration,
          workspace,
        );

        return findTypeOrParentType(node, inferenceResult) ?? TUnknown;
      }

      return TUnknown;
    } catch (error) {
      const connection = container.resolve<Connection>("Connection");
      connection.console.warn(`Error while trying to infer a type. ${error}`);
      return TUnknown;
    }
  }

  function getDiagnostics(
    treeContainer: ITreeContainer,
    token?: ICancellationToken,
  ): Diagnostic[] {
    try {
      cancellationToken = token;

      checkNode(treeContainer.tree.rootNode);

      return diagnostics.get(treeContainer.uri);
    } finally {
      cancellationToken = undefined;
    }
  }

  function getDiagnosticsAsync(
    treeContainer: ITreeContainer,
    token?: ICancellationToken,
    cancelCallback?: () => boolean,
  ): Promise<Diagnostic[]> {
    cancellationToken = token;

    return new Promise((resolve, reject) => {
      const children = treeContainer.tree.rootNode.children;
      let index = 0;

      const goNext = (): void => {
        index++;
        if (children.length > index) {
          setImmediate(checkOne);
        } else {
          cancellationToken = undefined;
          resolve(diagnostics.get(treeContainer.uri));
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
    treeContainer: ITreeContainer,
    token?: ICancellationToken,
  ): Diagnostic[] {
    try {
      cancellationToken = token;

      checkNode(treeContainer.tree.rootNode);

      return suggestionDiagnostics.get(treeContainer.uri);
    } finally {
      cancellationToken = undefined;
    }
  }

  function getAllImports(treeContainer: ITreeContainer): Imports {
    const cached = imports.get(treeContainer.uri);

    if (cached) {
      return cached;
    }

    const allImports = Imports.getImports(treeContainer, forest);
    imports.set(treeContainer.uri, allImports);
    return allImports;
  }

  function findImport(
    treeContainer: ITreeContainer,
    name: string,
    filter?: (imp: IImport) => boolean,
  ): DefinitionResult | undefined {
    const possibleImport = getAllImports(treeContainer).get(name, filter);

    if (possibleImport) {
      return {
        node: possibleImport.node,
        nodeType: possibleImport.type,
        uri: possibleImport.fromUri,
      };
    }
  }

  function findImportOfType(
    treeContainer: ITreeContainer,
    name: string,
    type: NodeType,
  ): DefinitionResult | undefined {
    return findImport(treeContainer, name, (imp) => imp.type === type);
  }

  function findDefinition(
    nodeAtPosition: SyntaxNode,
    treeContainer: ITreeContainer,
  ): DefinitionResult | undefined {
    const definition = findDefinitionShallow(nodeAtPosition, treeContainer);

    if (
      definition?.node.type === "lower_pattern" &&
      definition.node.firstNamedChild
    ) {
      const innerDefinition = findDefinitionShallow(
        definition.node.firstNamedChild,
        treeContainer,
      );

      if (innerDefinition) {
        return innerDefinition;
      }
    }

    return definition;
  }

  function findDefinitionShallow(
    nodeAtPosition: SyntaxNode,
    treeContainer: ITreeContainer,
  ): DefinitionResult | undefined {
    const uri = treeContainer.uri;
    const nodeText = nodeAtPosition.text;
    const nodeParent = nodeAtPosition.parent;

    if (!nodeParent) {
      return;
    }

    const nodeParentType = nodeParent.type;

    const rootSymbols = treeContainer.symbolLinks?.get(
      treeContainer.tree.rootNode,
    );

    if (
      nodeParentType === "upper_case_qid" &&
      nodeParent.previousNamedSibling?.type === "module"
    ) {
      const moduleNode = nodeParent.parent;

      if (moduleNode) {
        return {
          node: moduleNode,
          nodeType: "Module",
          uri,
        };
      }
    } else if (
      nodeParentType === "upper_case_qid" &&
      nodeParent.previousNamedSibling?.type === "import"
    ) {
      const upperCaseQid = nodeParent;
      const upperCaseQidText = upperCaseQid.text;
      return findImportOfType(treeContainer, upperCaseQidText, "Module");
    } else if (
      (nodeParentType === "exposed_value" &&
        nodeParent.parent?.parent?.type === "module_declaration") ||
      nodeParentType === "type_annotation"
    ) {
      const definitionNode = rootSymbols?.get(nodeText);

      if (definitionNode && definitionNode.type === "Function") {
        return {
          node: definitionNode.node,
          nodeType: definitionNode.type,
          uri,
        };
      }
    } else if (
      (nodeParentType === "exposed_type" &&
        nodeParent.parent?.parent?.type === "module_declaration") ||
      nodeAtPosition.previousNamedSibling?.type === "type" ||
      nodeAtPosition.previousNamedSibling?.type === "alias"
    ) {
      const definitionNode = rootSymbols?.get(nodeText);

      if (definitionNode) {
        return {
          node: definitionNode.node,
          nodeType: definitionNode.type,
          uri,
        };
      }
    } else if (
      (nodeParentType === "exposed_value" ||
        nodeParentType === "exposed_type") &&
      nodeParent.parent?.parent?.type === "import_clause"
    ) {
      return findImport(treeContainer, nodeText);
    } else if (nodeParentType === "union_variant") {
      const definitionNode = nodeParent;
      return {
        node: definitionNode,
        nodeType: "UnionConstructor",
        uri,
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

      const definitionNode = rootSymbols?.get(upperCaseQidText, (symbol) =>
        isTypeUsage
          ? symbol.type === "Type" || symbol.type === "TypeAlias"
          : isConstructorUsage
          ? symbol.type === "UnionConstructor" ||
            (symbol.type === "TypeAlias" &&
              symbol.node.childForFieldName("typeExpression")?.children[0]
                ?.type === "record_type")
          : symbol.type === "UnionConstructor",
      );

      if (definitionNode) {
        return {
          node: definitionNode.node,
          nodeType: definitionNode.type,
          uri,
        };
      }

      let definitionFromOtherFile;

      // Make sure the next node is a dot, or else it isn't a Module
      if (TreeUtils.nextNode(nodeAtPosition)?.type === "dot") {
        const endPos = upperCaseQidText.indexOf(nodeText) + nodeText.length;

        const moduleNameOrAlias = nodeParent.text.substring(0, endPos);
        const moduleName =
          findImportModuleNameNode(moduleNameOrAlias, treeContainer)?.text ??
          moduleNameOrAlias;

        const definitionFromOtherFile = findImportOfType(
          treeContainer,
          moduleName,
          "Module",
        );
        if (definitionFromOtherFile) {
          return definitionFromOtherFile;
        }
      }

      if (isTypeUsage) {
        definitionFromOtherFile = findImportOfType(
          treeContainer,
          upperCaseQidText,
          "Type",
        );
        if (definitionFromOtherFile) {
          return definitionFromOtherFile;
        }
      } else {
        definitionFromOtherFile = findImportOfType(
          treeContainer,
          upperCaseQidText,
          "UnionConstructor",
        );
        if (definitionFromOtherFile) {
          return definitionFromOtherFile;
        }
      }

      definitionFromOtherFile = findImportOfType(
        treeContainer,
        upperCaseQidText,
        "TypeAlias",
      );
      if (definitionFromOtherFile) {
        return definitionFromOtherFile;
      }

      definitionFromOtherFile = findImportOfType(
        treeContainer,
        findImportModuleNameNode(upperCaseQidText, treeContainer)?.text ??
          upperCaseQidText,
        "Module",
      );

      if (definitionFromOtherFile) {
        return definitionFromOtherFile;
      }
    } else if (
      nodeParentType === "lower_pattern" &&
      nodeParent.parent?.type === "record_pattern"
    ) {
      const type = findType(nodeParent.parent);
      return TreeUtils.findFieldReference(type, nodeText);
    } else if (
      nodeAtPosition.type === "lower_case_identifier" &&
      nodeParentType === "function_declaration_left" &&
      nodeParent.parent?.type === "value_declaration"
    ) {
      // The function name should resolve to itself
      if (nodeParent.firstNamedChild?.text === nodeText) {
        return {
          node: nodeParent.parent,
          nodeType: "Function",
          uri: treeContainer.uri,
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
        .map((node) =>
          treeContainer.symbolLinks
            ?.get(node)
            ?.get(
              nodeAtPositionText,
              (s) => s.node.type !== "infix_declaration",
            ),
        )
        .find(Utils.notUndefined.bind(findDefinition));

      if (localBinding) {
        return {
          node: localBinding.node,
          nodeType: localBinding.type,
          uri: treeContainer.uri,
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
            findImportModuleNameNode(moduleNameOrAlias, treeContainer)?.text ??
            moduleNameOrAlias;

          const moduleDefinitionFromOtherFile = findImportOfType(
            treeContainer,
            moduleName,
            "Module",
          );

          if (moduleDefinitionFromOtherFile) {
            return moduleDefinitionFromOtherFile;
          }
        }

        const portDefinitionFromOtherFile = findImportOfType(
          treeContainer,
          nodeParentText,
          "Port",
        );

        if (portDefinitionFromOtherFile) {
          return portDefinitionFromOtherFile;
        }

        const functionDefinitionFromOtherFile = findImportOfType(
          treeContainer,
          nodeParentText,
          "Function",
        );

        if (functionDefinitionFromOtherFile) {
          return functionDefinitionFromOtherFile;
        }
      }
    } else if (nodeAtPosition.type === "operator_identifier") {
      const operatorsCache = workspace.getOperatorsCache();
      const cached = operatorsCache.get(nodeText);
      if (cached) {
        return cached;
      }

      const definitionNode = TreeUtils.findOperator(treeContainer, nodeText);
      if (definitionNode) {
        const result: DefinitionResult = {
          node: definitionNode,
          uri,
          nodeType: "Operator",
        };
        operatorsCache.set(nodeText, result);
        return result;
      } else {
        const definitionFromOtherFile = findImportOfType(
          treeContainer,
          nodeText,
          "Operator",
        );

        if (definitionFromOtherFile) {
          operatorsCache.set(nodeText, definitionFromOtherFile);
          return definitionFromOtherFile;
        }
      }
    } else if (nodeParentType === "field_access_expr") {
      let target = nodeParent?.childForFieldName("target");

      // Adjust for parenthesis expr. Will need to change when we handle it better in inference
      if (target?.type === "parenthesized_expr") {
        target = target.namedChildren[1];
      }

      if (target) {
        const type = findType(target);
        return TreeUtils.findFieldReference(type, nodeText);
      }
    } else if (
      nodeAtPosition.type === "lower_case_identifier" &&
      nodeParentType === "field" &&
      nodeParent.parent?.type === "record_expr"
    ) {
      const type = findType(nodeParent.parent);
      return TreeUtils.findFieldReference(type, nodeText);
    } else if (
      nodeAtPosition.type === "lower_case_identifier" &&
      nodeParentType === "field_accessor_function_expr"
    ) {
      const type = findType(nodeParent);

      if (type.nodeType === "Function") {
        const paramType = type.params[0];

        return TreeUtils.findFieldReference(paramType, nodeText);
      }
    } else if (
      nodeAtPosition.type === "lower_case_identifier" &&
      nodeParentType === "field_type"
    ) {
      return {
        node: nodeParent,
        nodeType: "FieldType",
        uri,
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

      return findImportOfType(
        treeContainer,
        findImportModuleNameNode(fullModuleName, treeContainer)?.text ??
          fullModuleName,
        "Module",
      );
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

      // Remove `flatMap` function when Node 10 is dropped
      const callback = (annotation: SyntaxNode | undefined): SyntaxNode[] =>
        annotation
          ? TreeUtils.descendantsOfType(annotation, "type_variable")
          : [];

      const allTypeVariables: SyntaxNode[] = allAnnotations.flatMap
        ? allAnnotations.flatMap(callback)
        : flatMap(allAnnotations, callback);

      const firstMatching = allTypeVariables.find((t) => t.text === nodeText);

      if (firstMatching) {
        return {
          node: firstMatching,
          nodeType: "TypeVariable",
          uri,
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
          node: firstMatching,
          nodeType: "TypeVariable",
          uri,
        };
      }
    }
  }

  function getQualifierForName(
    treeContainer: ITreeContainer,
    module: string,
    name: string,
  ): string | undefined {
    const found = findImport(
      treeContainer,
      name,
      (imp) =>
        imp.fromModuleName === module &&
        (imp.type === "Type" ||
          imp.type === "TypeAlias" ||
          imp.type === "UnionConstructor"),
    );
    if (found) {
      return "";
    }

    const moduleImport = findImportModuleNameNode(module, treeContainer)
      ?.parent;

    if (!moduleImport) {
      return;
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

  function typeToString(t: Type, treeContainer?: ITreeContainer): string {
    return new TypeRenderer(typeChecker, treeContainer).render(t);
  }

  /**
   * Get the module name node if the name is an alias
   */
  function findImportModuleNameNode(
    moduleNameOrAlias: string,
    treeContainer: ITreeContainer,
  ): SyntaxNode | undefined {
    return (
      treeContainer.symbolLinks
        ?.get(treeContainer.tree.rootNode)
        ?.get(moduleNameOrAlias, (s) => s.type === "Import")
        ?.node.childForFieldName("moduleName") ?? undefined
    );
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
      workspace,
      new Set(),
      cancellationToken,
    );
    result.diagnostics.forEach((diagnostic) => diagnostics.add(diagnostic));

    if (!declaration.typeAnnotation) {
      const typeString: string = typeToString(
        result.type,
        forest.getByUri(declaration.tree.uri),
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
      if (!workspace.hasAccessibleModule(moduleName)) {
        diagnostics.add(
          error(moduleNameNode, Diagnostics.ImportMissing, moduleName),
        );
      }
    }
  }

  function checkTypeAliasDeclaration(typeAliasDeclaration: SyntaxNode): void {
    TypeExpression.typeAliasDeclarationInference(
      mapSyntaxNodeToExpression(typeAliasDeclaration) as ETypeAliasDeclaration,
      workspace,
    ).diagnostics.forEach((diagnostic) => diagnostics.add(diagnostic));
  }

  function checkTypeDeclaration(typeDeclaration: SyntaxNode): void {
    TypeExpression.typeDeclarationInference(
      mapSyntaxNodeToExpression(typeDeclaration) as ETypeDeclaration,
      workspace,
    ).diagnostics.forEach((diagnostic) => diagnostics.add(diagnostic));

    // Need to check union variants
    typeDeclaration.children.forEach(checkNode);
  }

  function checkUnionVariant(unionVariant: SyntaxNode): void {
    TypeExpression.unionVariantInference(
      mapSyntaxNodeToExpression(unionVariant) as EUnionVariant,
      workspace,
    ).diagnostics.forEach((diagnostic) => diagnostics.add(diagnostic));
  }

  function checkPortAnnotation(portAnnotation: SyntaxNode): void {
    TypeExpression.portAnnotationInference(
      mapSyntaxNodeToExpression(portAnnotation) as EPortAnnotation,
      workspace,
    ).diagnostics.forEach((diagnostic) => diagnostics.add(diagnostic));
  }
}
