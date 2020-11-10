/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/naming-convention */
import { SyntaxNode } from "web-tree-sitter";
import { flatMap, NodeType, TreeUtils } from "../treeUtils";
import {
  Expression,
  EValueDeclaration,
  mapSyntaxNodeToExpression,
} from "./expressionTree";
import { IElmWorkspace } from "../../elmWorkspace";
import { container } from "tsyringe";
import { IConnection } from "vscode-languageserver";
import { Type, TUnknown, InferenceScope, Diagnostic } from "./typeInference";
import { ITreeContainer } from "../../forest";
import { IImport, Imports } from "../../imports";
import { TypeRenderer } from "./typeRenderer";
import { performance } from "perf_hooks";
import { bindTreeContainer } from "./binder";
import { Sequence } from "../sequence";

export let bindTime = 0;
export function resetBindTime(): void {
  bindTime = 0;
}

export interface DefinitionResult {
  node: SyntaxNode;
  uri: string;
  nodeType: NodeType;
}

export interface TypeChecker {
  findType: (node: SyntaxNode, uri: string) => Type;
  // getExposedForModule: (moduleName: string) => IExposing[];
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
  getDiagnostics: (treeContainer: ITreeContainer) => Diagnostic[];
}

export function createTypeChecker(workspace: IElmWorkspace): TypeChecker {
  const forest = workspace.getForest();
  const imports = new Map<string, Imports>();

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
  };

  return typeChecker;

  function findType(node: SyntaxNode, uri: string): Type {
    try {
      let declaration: SyntaxNode | null = node;
      while (
        declaration &&
        (declaration.type !== "value_declaration" ||
          declaration.parent?.type !== "file")
      ) {
        declaration = declaration.parent;
      }

      // We can't find the top level declaration
      if (
        declaration?.type !== "value_declaration" ||
        declaration.parent?.type !== "file"
      ) {
        return TUnknown;
      }

      const mappedDeclaration = mapSyntaxNodeToExpression(declaration);

      if (
        mappedDeclaration &&
        mappedDeclaration.nodeType === "ValueDeclaration"
      ) {
        const inferenceResult = InferenceScope.valueDeclarationInference(
          mappedDeclaration,
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

        const findTypeOrParentType = (
          expr: SyntaxNode | undefined,
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
            return findTypeOrParentType(expr.parent);
          }
        };

        return findTypeOrParentType(node) ?? TUnknown;
      } else {
        return TUnknown;
      }
    } catch (error) {
      const connection = container.resolve<IConnection>("Connection");
      connection.console.warn(`Error while trying to infer a type. ${error}`);
      return TUnknown;
    }
  }

  function getDiagnostics(treeContainer: ITreeContainer): Diagnostic[] {
    const allTopLevelFunctions = TreeUtils.findAllTopLevelFunctionDeclarations(
      treeContainer.tree,
    );

    return (
      allTopLevelFunctions
        ?.map(
          (valueDeclaration) =>
            InferenceScope.valueDeclarationInference(
              mapSyntaxNodeToExpression(valueDeclaration) as EValueDeclaration,
              treeContainer.uri,
              workspace,
              new Set(),
            ).diagnostics,
        )
        .reduce((a, b) => a.concat(b), [])
        .filter(
          (diagnostic) => diagnostic.node.tree.uri === treeContainer.uri,
        ) ?? []
    );
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
    const tree = treeContainer.tree;
    if (
      nodeAtPosition.parent &&
      nodeAtPosition.parent.type === "upper_case_qid" &&
      nodeAtPosition.parent.previousNamedSibling &&
      nodeAtPosition.parent.previousNamedSibling.type === "module"
    ) {
      const moduleNode = nodeAtPosition.parent.parent;

      if (moduleNode) {
        return {
          node: moduleNode,
          nodeType: "Module",
          uri,
        };
      }
    } else if (
      nodeAtPosition.parent &&
      nodeAtPosition.parent.type === "upper_case_qid" &&
      nodeAtPosition.parent.previousNamedSibling &&
      nodeAtPosition.parent.previousNamedSibling.type === "import"
    ) {
      const upperCaseQid = nodeAtPosition.parent;
      return findImportOfType(treeContainer, upperCaseQid.text, "Module");
    } else if (
      nodeAtPosition.parent &&
      nodeAtPosition.parent.type === "function_declaration_left"
    ) {
      const definitionNode =
        nodeAtPosition.parent.parent &&
        nodeAtPosition.parent.parent.parent &&
        nodeAtPosition.parent.parent.parent.type === "let_in_expr"
          ? TreeUtils.findFunction(
              nodeAtPosition.parent.parent.parent,
              nodeAtPosition.text,
              false,
            )
          : TreeUtils.findFunction(tree.rootNode, nodeAtPosition.text);

      if (definitionNode) {
        return {
          node: definitionNode,
          nodeType: "Function",
          uri,
        };
      }
    } else if (
      (nodeAtPosition.parent &&
        nodeAtPosition.parent.type === "exposed_value" &&
        nodeAtPosition.parent.parent &&
        nodeAtPosition.parent.parent.parent &&
        nodeAtPosition.parent.parent.parent.type === "module_declaration") ||
      (nodeAtPosition.parent &&
        nodeAtPosition.parent.type === "type_annotation")
    ) {
      const definitionNode = TreeUtils.findFunction(
        tree.rootNode,
        nodeAtPosition.text,
      );

      if (definitionNode) {
        return {
          node: definitionNode,
          nodeType: "Function",
          uri,
        };
      }
    } else if (
      (nodeAtPosition.parent &&
        nodeAtPosition.parent.type === "exposed_type" &&
        nodeAtPosition.parent.parent &&
        nodeAtPosition.parent.parent.parent &&
        nodeAtPosition.parent.parent.parent.type === "module_declaration") ||
      (nodeAtPosition.previousNamedSibling &&
        (nodeAtPosition.previousNamedSibling.type === "type" ||
          nodeAtPosition.previousNamedSibling.type === "alias"))
    ) {
      const definitionNode = treeContainer.symbolLinks
        ?.get(treeContainer.tree.rootNode)
        ?.get(nodeAtPosition.text);

      if (definitionNode) {
        return {
          node: definitionNode.node,
          nodeType: definitionNode.type,
          uri,
        };
      }
    } else if (
      (nodeAtPosition.parent?.type === "exposed_value" ||
        nodeAtPosition.parent?.type === "exposed_type") &&
      nodeAtPosition.parent.parent?.parent?.type === "import_clause"
    ) {
      return findImport(treeContainer, nodeAtPosition.text);
    } else if (
      nodeAtPosition.parent &&
      nodeAtPosition.parent.type === "union_variant"
    ) {
      const definitionNode = nodeAtPosition.parent;
      return {
        node: definitionNode,
        nodeType: "UnionConstructor",
        uri,
      };
    } else if (
      nodeAtPosition.parent &&
      nodeAtPosition.parent.type === "upper_case_qid"
    ) {
      const upperCaseQid = nodeAtPosition.parent;

      // Usage is either a type or a constructor
      // A type can only be used as a type
      // A union variant can only be used as a constructor or as a pattern
      // A type alias can be used as both a type and a constructor
      const isTypeUsage =
        TreeUtils.findParentOfType("type_ref", upperCaseQid) ||
        upperCaseQid.parent?.type === "exposed_type";
      const isConstructorUsage = upperCaseQid.parent?.type === "value_expr";

      const definitionNode = treeContainer.symbolLinks
        ?.get(treeContainer.tree.rootNode)
        ?.get(upperCaseQid.text, (symbol) =>
          isTypeUsage
            ? symbol.type === "Type" || symbol.type === "TypeAlias"
            : isConstructorUsage
            ? symbol.type === "UnionConstructor" || symbol.type === "TypeAlias"
            : symbol.type === "UnionConstructor",
        );

      // if (
      //   nodeAtPosition.parent?.parent?.parent?.type === "pattern" &&
      //   definitionNode?.type === "TypeAlias"
      // ) {
      //   return;
      // }

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
        const endPos =
          upperCaseQid.text.indexOf(nodeAtPosition.text) +
          nodeAtPosition.text.length;

        const moduleNameOrAlias = nodeAtPosition.parent.text.substring(
          0,
          endPos,
        );
        const moduleName =
          TreeUtils.findImportNameNode(tree, moduleNameOrAlias)?.text ??
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
          upperCaseQid.text,
          "Type",
        );
        if (definitionFromOtherFile) {
          return definitionFromOtherFile;
        }
      } else {
        definitionFromOtherFile = findImportOfType(
          treeContainer,
          upperCaseQid.text,
          "UnionConstructor",
        );
        if (definitionFromOtherFile) {
          return definitionFromOtherFile;
        }
      }

      definitionFromOtherFile = findImportOfType(
        treeContainer,
        upperCaseQid.text,
        "TypeAlias",
      );
      if (definitionFromOtherFile) {
        return definitionFromOtherFile;
      }

      definitionFromOtherFile = findImportOfType(
        treeContainer,
        TreeUtils.findImportNameNode(tree, upperCaseQid.text)?.text ??
          upperCaseQid.text,
        "Module",
      );

      if (definitionFromOtherFile) {
        return definitionFromOtherFile;
      }
    } else if (
      nodeAtPosition.parent?.type === "lower_pattern" &&
      nodeAtPosition.parent.parent?.type === "record_pattern"
    ) {
      const type = findType(nodeAtPosition.parent.parent, uri);
      return TreeUtils.findFieldReference(type, nodeAtPosition.text);
    } else if (
      nodeAtPosition.parent &&
      (nodeAtPosition.parent.type === "value_qid" ||
        nodeAtPosition.parent.type === "lower_pattern" ||
        nodeAtPosition.parent.type === "record_base_identifier")
    ) {
      let nodeAtPositionText = nodeAtPosition.text;
      if (nodeAtPosition.parent.type === "value_qid") {
        nodeAtPositionText = nodeAtPosition.parent.text;
      }

      // Traverse the parents and find a binding
      const localBinding = new Sequence(
        nodeAtPosition,
        (node) => node.parent ?? undefined,
      )
        .map((node) =>
          treeContainer.symbolLinks?.get(node)?.get(nodeAtPositionText),
        )
        .find((binding) => !!binding);

      if (localBinding) {
        return {
          node: localBinding.node,
          nodeType: localBinding.type,
          uri: treeContainer.uri,
        };
      } else {
        // Get the full module name and handle an import alias if there is one
        const endPos =
          nodeAtPosition.parent.text.indexOf(nodeAtPosition.text) +
          nodeAtPosition.text.length;
        const moduleNameOrAlias = nodeAtPosition.parent.text.substring(
          0,
          endPos,
        );
        const moduleName =
          TreeUtils.findImportNameNode(tree, moduleNameOrAlias)?.text ??
          moduleNameOrAlias;

        const moduleDefinitionFromOtherFile = findImportOfType(
          treeContainer,
          moduleName,
          "Module",
        );

        if (moduleDefinitionFromOtherFile) {
          return moduleDefinitionFromOtherFile;
        }

        const portDefinitionFromOtherFile = findImportOfType(
          treeContainer,
          nodeAtPosition.parent.text,
          "Port",
        );

        if (portDefinitionFromOtherFile) {
          return portDefinitionFromOtherFile;
        }

        const functionDefinitionFromOtherFile = findImportOfType(
          treeContainer,
          nodeAtPosition.parent.text,
          "Function",
        );

        if (functionDefinitionFromOtherFile) {
          return functionDefinitionFromOtherFile;
        }
      }
    } else if (nodeAtPosition.type === "operator_identifier") {
      const definitionNode = TreeUtils.findOperator(tree, nodeAtPosition.text);

      if (!definitionNode) {
        const definitionFromOtherFile = findImportOfType(
          treeContainer,
          nodeAtPosition.text,
          "Operator",
        );

        if (definitionFromOtherFile) {
          return definitionFromOtherFile;
        }
      }
      if (definitionNode) {
        return { node: definitionNode, uri, nodeType: "Operator" };
      }
    } else if (nodeAtPosition.parent?.type === "field_access_expr") {
      let target = nodeAtPosition.parent?.childForFieldName("target");

      // Adjust for parenthesis expr. Will need to change when we handle it better in inference
      if (target?.type === "parenthesized_expr") {
        target = target.namedChildren[1];
      }

      if (target) {
        const type = findType(target, uri);
        return TreeUtils.findFieldReference(type, nodeAtPosition.text);
      }
    } else if (
      nodeAtPosition.type === "lower_case_identifier" &&
      nodeAtPosition.parent?.type === "field" &&
      nodeAtPosition.parent.parent?.type === "record_expr"
    ) {
      const type = findType(nodeAtPosition.parent.parent, uri);
      return TreeUtils.findFieldReference(type, nodeAtPosition.text);
    } else if (
      nodeAtPosition.type === "lower_case_identifier" &&
      nodeAtPosition.parent?.type === "field_accessor_function_expr"
    ) {
      const type = findType(nodeAtPosition.parent, uri);

      if (type.nodeType === "Function") {
        const paramType = type.params[0];

        return TreeUtils.findFieldReference(paramType, nodeAtPosition.text);
      }
    } else if (
      nodeAtPosition.type === "lower_case_identifier" &&
      nodeAtPosition.parent?.type === "field_type"
    ) {
      return {
        node: nodeAtPosition.parent,
        nodeType: "FieldType",
        uri,
      };
    } else if (
      nodeAtPosition.type === "upper_case_identifier" &&
      nodeAtPosition.parent?.type === "ERROR"
    ) {
      let fullModuleName = nodeAtPosition.text;

      // Get fully qualified module name
      // Ex: nodeAtPosition.text is Attributes, we need to get Html.Attributes manually
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
        TreeUtils.findImportNameNode(tree, fullModuleName)?.text ??
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

      const firstMatching = allTypeVariables.find(
        (t) => t.text === nodeAtPosition.text,
      );

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

      const firstMatching = allTypeNames?.find(
        (t) => t.text === nodeAtPosition.text,
      );

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

    const moduleImport = TreeUtils.findImportClauseByName(
      treeContainer.tree,
      module,
    );

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
}
