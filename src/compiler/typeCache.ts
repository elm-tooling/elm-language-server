import { Node } from "web-tree-sitter";
import { MultiMap } from "../common/util/multiMap";
import { TreeUtils } from "../common/util/treeUtils";
import { SyntaxNodeMap } from "./utils/syntaxNodeMap";
import { InferenceResult } from "./typeInference";

type CacheKey =
  | "PACKAGE_TYPE_ANNOTATION"
  | "PACKAGE_TYPE_AND_TYPE_ALIAS"
  | "PACKAGE_VALUE_DECLARATION"
  | "PACKAGE_UNION_VARIANT"
  | "PROJECT_TYPE_ANNOTATION"
  | "PROJECT_TYPE_AND_TYPE_ALIAS"
  | "PROJECT_VALUE_DECLARATION"
  | "PROJECT_UNION_VARIANT";

export class TypeCache {
  private packageTypeAnnotation: SyntaxNodeMap<Node, InferenceResult>;
  private packageTypeAndTypeAlias: SyntaxNodeMap<Node, InferenceResult>;
  private packageValueDeclaration: SyntaxNodeMap<Node, InferenceResult>;
  private packageUnionVariant: SyntaxNodeMap<Node, InferenceResult>;
  private projectTypeAnnotation: SyntaxNodeMap<Node, InferenceResult>;
  private projectTypeAndTypeAlias: SyntaxNodeMap<Node, InferenceResult>;
  private projectValueDeclaration: SyntaxNodeMap<Node, InferenceResult>;
  private projectUnionVariant: SyntaxNodeMap<Node, InferenceResult>;
  private declarationAnnotations: MultiMap<number, Node>;
  private typeUnionVariants: MultiMap<number, Node>;

  constructor() {
    this.packageTypeAnnotation = new SyntaxNodeMap<Node, InferenceResult>();
    this.packageTypeAndTypeAlias = new SyntaxNodeMap<Node, InferenceResult>();
    this.packageValueDeclaration = new SyntaxNodeMap<Node, InferenceResult>();
    this.packageUnionVariant = new SyntaxNodeMap<Node, InferenceResult>();
    this.projectTypeAnnotation = new SyntaxNodeMap<Node, InferenceResult>();
    this.projectTypeAndTypeAlias = new SyntaxNodeMap<Node, InferenceResult>();
    this.projectValueDeclaration = new SyntaxNodeMap<Node, InferenceResult>();
    this.projectUnionVariant = new SyntaxNodeMap<Node, InferenceResult>();

    this.declarationAnnotations = new MultiMap();
    this.typeUnionVariants = new MultiMap();
  }

  public getOrSet(
    key: CacheKey,
    node: Node,
    setter: () => InferenceResult,
  ): InferenceResult {
    switch (key) {
      case "PACKAGE_TYPE_ANNOTATION":
        return this.packageTypeAnnotation.getOrSet(node, setter);
      case "PACKAGE_TYPE_AND_TYPE_ALIAS":
        return this.packageTypeAndTypeAlias.getOrSet(node, setter);
      case "PACKAGE_VALUE_DECLARATION":
        return this.packageValueDeclaration.getOrSet(node, setter);
      case "PACKAGE_UNION_VARIANT":
        return this.packageUnionVariant.getOrSet(node, setter);
      case "PROJECT_TYPE_ANNOTATION":
        return this.projectTypeAnnotation.getOrSet(node, setter);
      case "PROJECT_TYPE_AND_TYPE_ALIAS":
        return this.projectTypeAndTypeAlias.getOrSet(node, setter);
      case "PROJECT_VALUE_DECLARATION":
        return this.projectValueDeclaration.getOrSet(node, setter);
      case "PROJECT_UNION_VARIANT":
        return this.projectUnionVariant.getOrSet(node, setter);
    }
  }

  public invalidateProject(): void {
    this.projectTypeAnnotation.clear();
    this.projectTypeAndTypeAlias.clear();
    this.projectValueDeclaration.clear();
    this.projectUnionVariant.clear();
  }

  public invalidateValueDeclaration(node: Node): void {
    this.projectValueDeclaration.delete(node);
    this.declarationAnnotations
      .getAll(node.id)
      ?.forEach((annotation) => this.projectTypeAnnotation.delete(annotation));
  }

  public invalidateTypeAnnotation(node: Node): void {
    this.projectTypeAnnotation.delete(node);
  }

  public invalidateTypeOrTypeAlias(node: Node): void {
    this.projectTypeAndTypeAlias.delete(node);
    this.typeUnionVariants
      .getAll(node.id)
      ?.forEach((variant) => this.projectUnionVariant.delete(variant));
  }

  /**
   * Track a type annotation
   *
   * We associate type annotations with its top level declaration
   * so we can clear its cache when we invalidate that declaration
   */
  public trackTypeAnnotation(annotation: Node): void {
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

  public trackUnionVariant(unionVariant: Node): void {
    const typeDeclaration = TreeUtils.findParentOfType(
      "type_declaration",
      unionVariant,
    );

    if (typeDeclaration) {
      this.typeUnionVariants.set(typeDeclaration.id, unionVariant);
    }
  }
}
