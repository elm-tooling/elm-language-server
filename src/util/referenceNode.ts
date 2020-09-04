import { SyntaxNode } from "tree-sitter-elm";
import { NodeType } from "./treeUtils";

export interface IReferenceNode {
  node: SyntaxNode;
  nodeType: NodeType;
  uri: string;
}
