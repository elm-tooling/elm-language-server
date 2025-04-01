import { Node } from "web-tree-sitter";
import { NodeType } from "./treeUtils";

export interface IReferenceNode {
  node: Node;
  nodeType: NodeType;
  uri: string;
}
