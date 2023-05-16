import {
  Position,
  Range,
  SymbolInformation,
  SymbolKind,
} from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";

export class SymbolInformationTranslator {
  public static translateNodeToSymbolInformation(
    uri: string,
    node: SyntaxNode,
  ): SymbolInformation | undefined {
    switch (node.type) {
      case "value_declaration":
        {
          const functionName = node.firstChild?.firstChild?.text;
          if (functionName) {
            return this.createSymbolInformation(
              functionName,
              node,
              SymbolKind.Function,
              uri,
            );
          }
        }
        break;
      case "module_declaration": {
        const nameNodeModule = node.childForFieldName("name");
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
      }
      case "type_declaration": {
        const nameNodeTypeDec = node.childForFieldName("name");
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
      }
      case "type_alias_declaration": {
        const nameNodeAliasDec = node.childForFieldName("name");
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
