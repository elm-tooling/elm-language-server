import { SyntaxNode } from "tree-sitter";
import {
  Position,
  Range,
  SymbolInformation,
  SymbolKind,
} from "vscode-languageserver";
import { TreeUtils } from "./treeUtils";

export class SymbolInformationTranslator {
  public static translateNodeToSymbolInformation(
    uri: string,
    node: SyntaxNode,
  ): SymbolInformation | undefined {
    switch (node.type) {
      case "file":
        return this.createSymbolInformation("file", node, SymbolKind.File, uri);
      case "value_declaration":
        return this.createSymbolInformation(
          node.children[0].children[0].text,
          node,
          SymbolKind.Function,
          uri,
        );
      case "module_declaration":
        const nameNodeModule = TreeUtils.findFirstNamedChildOfType(
          "upper_case_qid",
          node,
        );
        if (nameNodeModule) {
          return this.createSymbolInformation(
            nameNodeModule.text,
            node,
            SymbolKind.Module,
            uri,
          );
        } else {
          return;
        }
      case "type_declaration":
        const nameNodeTypeDec = TreeUtils.findFirstNamedChildOfType(
          "upper_case_identifier",
          node,
        );
        if (nameNodeTypeDec) {
          return this.createSymbolInformation(
            nameNodeTypeDec.text,
            node,
            SymbolKind.Enum,
            uri,
          );
        } else {
          return;
        }
      case "type_alias_declaration":
        const nameNodeAliasDec = TreeUtils.findFirstNamedChildOfType(
          "upper_case_identifier",
          node,
        );
        if (nameNodeAliasDec) {
          return this.createSymbolInformation(
            nameNodeAliasDec.text,
            node,
            SymbolKind.Struct,
            uri,
          );
        } else {
          return;
        }
      case "union_variant":
        return this.createSymbolInformation(
          node.text,
          node,
          SymbolKind.EnumMember,
          uri,
        );
      default:
        break;
    }
  }

  private static createSymbolInformation(
    name: string,
    node: SyntaxNode,
    symbolKind: SymbolKind,
    uri: string,
  ): SymbolInformation {
    return SymbolInformation.create(
      name,
      symbolKind,
      Range.create(
        Position.create(node.startPosition.row, node.startPosition.column),
        Position.create(node.endPosition.row, node.endPosition.column),
      ),
      uri,
    );
  }
}
