import { SyntaxNode } from "web-tree-sitter";
import { MultiMap } from "../util/multiMap.js";
import { TreeUtils } from "../util/treeUtils.js";
import { SyntaxNodeMap } from "./utils/syntaxNodeMap.js";
import { InferenceResult } from "./typeInference.js";

type CacheKey =
  | "PACKAGE_TYPE_ANNOTATION"
  | "PACKAGE_TYPE_AND_TYPE_ALIAS"
  | "PACKAGE_VALUE_DECLARATION"
  | "PROJECT_TYPE_ANNOTATION"
  | "PROJECT_TYPE_AND_TYPE_ALIAS"
  | "PROJECT_VALUE_DECLARATION";

export class TypeCache {
  private packageTypeAnnotation: SyntaxNodeMap<SyntaxNode, InferenceResult>;
  private packageTypeAndTypeAlias: SyntaxNodeMap<SyntaxNode, InferenceResult>;
  private packageValueDeclaration: SyntaxNodeMap<SyntaxNode, InferenceResult>;
  private projectTypeAnnotation: SyntaxNodeMap<SyntaxNode, InferenceResult>;
  private projectTypeAndTypeAlias: SyntaxNodeMap<SyntaxNode, InferenceResult>;
  private projectValueDeclaration: SyntaxNodeMap<SyntaxNode, InferenceResult>;
  private declarationAnnotations: MultiMap<number, SyntaxNode>;

  constructor() {
    this.packageTypeAnnotation = new SyntaxNodeMap<
      SyntaxNode,
      InferenceResult
    >();
    this.packageTypeAndTypeAlias = new SyntaxNodeMap<
      SyntaxNode,
      InferenceResult
    >();
    this.packageValueDeclaration = new SyntaxNodeMap<
      SyntaxNode,
      InferenceResult
    >();
    this.projectTypeAnnotation = new SyntaxNodeMap<
      SyntaxNode,
      InferenceResult
    >();
    this.projectTypeAndTypeAlias = new SyntaxNodeMap<
      SyntaxNode,
      InferenceResult
    >();
    this.projectValueDeclaration = new SyntaxNodeMap<
      SyntaxNode,
      InferenceResult
    >();
    this.declarationAnnotations = new MultiMap();
  }

  public getOrSet(
    key: CacheKey,
    node: SyntaxNode,
    setter: () => InferenceResult,
  ): InferenceResult {
    switch (key) {
      case "PACKAGE_TYPE_ANNOTATION":
        return this.packageTypeAnnotation.getOrSet(node, setter);
      case "PACKAGE_TYPE_AND_TYPE_ALIAS":
        return this.packageTypeAndTypeAlias.getOrSet(node, setter);
      case "PACKAGE_VALUE_DECLARATION":
        return this.packageValueDeclaration.getOrSet(node, setter);
      case "PROJECT_TYPE_ANNOTATION":
        return this.projectTypeAnnotation.getOrSet(node, setter);
      case "PROJECT_TYPE_AND_TYPE_ALIAS":
        return this.projectTypeAndTypeAlias.getOrSet(node, setter);
      case "PROJECT_VALUE_DECLARATION":
        return this.projectValueDeclaration.getOrSet(node, setter);
    }
  }

  public invalidateProject(): void {
    this.projectTypeAnnotation.clear();
    this.projectTypeAndTypeAlias.clear();
    this.projectValueDeclaration.clear();
  }

  public invalidateValueDeclaration(node: SyntaxNode): void {
    this.projectValueDeclaration.delete(node);
    this.declarationAnnotations
      .getAll(node.id)
      ?.forEach((annotation) => this.projectTypeAnnotation.delete(annotation));
  }

  public invalidateTypeAnnotation(node: SyntaxNode): void {
    this.projectTypeAnnotation.delete(node);
  }

  public invalidateTypeOrTypeAlias(node: SyntaxNode): void {
    this.projectTypeAndTypeAlias.delete(node);
  }

  /**
   * Track a type annotation
   *
   * We associate type annotations with its top level declaration
   * so we can clear its cache when we invalidate that declaration
   */
  public trackTypeAnnotation(annotation: SyntaxNode): void {
    const declaration =
      annotation.parent?.type === "file"
        ? TreeUtils.getValueDeclaration(annotation)
        : TreeUtils.findParentOfType(
            "value_declaration",
            annotation,
            /* topLevel */ true,
          );

    if (declaration) {
      this.declarationAnnotations.set(declaration.id, annotation);
    }
  }
}
