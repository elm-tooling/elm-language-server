import { SyntaxNode } from "web-tree-sitter";
import { SyntaxNodeMap } from "./syntaxNodeMap";
import { InferenceResult } from "./typeInference";

type CacheKey =
  | "PACKAGE_TYPE_ANNOTATION"
  | "PACKAGE_TYPE_AND_TYPE_ALIAS"
  | "PACKAGE_VALUE"
  | "PROJECT_TYPE_ANNOTATION"
  | "PROJECT_TYPE_AND_TYPE_ALIAS"
  | "PROJECT_VALUE";

export class TypeCache {
  private packageTypeAnnotation: SyntaxNodeMap<SyntaxNode, InferenceResult>;
  private packageTypeAndTypeAlias: SyntaxNodeMap<SyntaxNode, InferenceResult>;
  private packageValue: SyntaxNodeMap<SyntaxNode, InferenceResult>;
  private projectTypeAnnotation: SyntaxNodeMap<SyntaxNode, InferenceResult>;
  private projectTypeAndTypeAlias: SyntaxNodeMap<SyntaxNode, InferenceResult>;
  private projectValue: SyntaxNodeMap<SyntaxNode, InferenceResult>;

  constructor() {
    this.packageTypeAnnotation = new SyntaxNodeMap<
      SyntaxNode,
      InferenceResult
    >();
    this.packageTypeAndTypeAlias = new SyntaxNodeMap<
      SyntaxNode,
      InferenceResult
    >();
    this.packageValue = new SyntaxNodeMap<SyntaxNode, InferenceResult>();
    this.projectTypeAnnotation = new SyntaxNodeMap<
      SyntaxNode,
      InferenceResult
    >();
    this.projectTypeAndTypeAlias = new SyntaxNodeMap<
      SyntaxNode,
      InferenceResult
    >();
    this.projectValue = new SyntaxNodeMap<SyntaxNode, InferenceResult>();
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
      case "PACKAGE_VALUE":
        return this.packageValue.getOrSet(node, setter);
      case "PROJECT_TYPE_ANNOTATION":
        return this.projectTypeAnnotation.getOrSet(node, setter);
      case "PROJECT_TYPE_AND_TYPE_ALIAS":
        return this.projectTypeAndTypeAlias.getOrSet(node, setter);
      case "PROJECT_VALUE":
        return this.projectValue.getOrSet(node, setter);
    }
  }

  public invalidateAll(): void {
    this.projectTypeAnnotation.clear();
    this.projectTypeAndTypeAlias.clear();
    this.projectValue.clear();
  }

  public invalidateValueDeclaration(node: SyntaxNode): void {
    this.projectValue.delete(node);
  }
}
