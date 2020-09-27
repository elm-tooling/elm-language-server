import { SyntaxNode } from "web-tree-sitter";
import { SyntaxNodeMap } from "./syntaxNodeMap";
import { InferenceResult } from "./typeInference";

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
  }
}
