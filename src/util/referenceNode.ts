import { SyntaxNode } from "web-tree-sitter";
import { NodeType } from "./treeUtils";

export interface IReferenceNode {
  node: SyntaxNode;
  nodeType: NodeType;
  uri: string;
}
