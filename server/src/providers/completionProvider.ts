import { SyntaxNode, Tree } from "tree-sitter";
import {
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  IConnection,
  MarkupKind,
  SymbolKind,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { IImports } from "../imports";
import { getSpecialItems } from "../util/elmUtils";
import { HintHelper } from "../util/hintHelper";
import { TreeUtils } from "../util/treeUtils";

export class CompletionProvider {
  private connection: IConnection;
  private forest: IForest;
  private imports: IImports;

  constructor(connection: IConnection, forest: IForest, imports: IImports) {
    this.connection = connection;
    this.forest = forest;
    this.imports = imports;

    this.connection.onCompletion(this.handleCompletionRequest);
  }

  public getCompletionsFromOtherFile(
    tree: Tree,
    uri: string,
  ): CompletionItem[] {
    const completions: CompletionItem[] = [];

    if (this.imports.imports && this.imports.imports[uri]) {
      const importList = this.imports.imports[uri];
      importList.forEach(element => {
        const value = HintHelper.createHint(element.node);
        switch (element.type) {
          case "Function":
            completions.push(
              this.createFunctionCompletion(value, element.alias),
            );
            break;
          case "UnionConstructor":
            completions.push(
              this.createUnionConstructorCompletion(element.alias),
            );
            break;
          case "Operator":
            completions.push(
              this.createOperatorCompletion(value, element.alias),
            );
            break;
          case "Type":
            completions.push(this.createTypeCompletion(value, element.alias));
            break;
          case "TypeAlias":
            completions.push(
              this.createTypeAliasCompletion(value, element.alias),
            );
            break;
          // Do not handle operators, they are not valid if prefixed
        }
      });
    }

    completions.push(
      ...getSpecialItems().map(a =>
        this.createCompletion(a.markdown, a.symbolKind, a.name),
      ),
    );

    return completions;
  }

  private handleCompletionRequest = (
    param: CompletionParams,
  ): CompletionItem[] | null | undefined => {
    const completions: CompletionItem[] = [];

    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    if (tree) {
      // Todo add variables from local let scopes
      // Add module exposing_list completions
      // Add import exposing_list completions
      // Add import name completions

      completions.push(...this.getSameFileTopLevelCompletions(tree));

      completions.push(
        ...this.getCompletionsFromOtherFile(tree, param.textDocument.uri),
      );

      return completions;
    }
  };

  private getSameFileTopLevelCompletions(tree: Tree): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const functions = TreeUtils.findAllFunctions(tree);
    // Add functions
    if (functions) {
      const declarations = functions.filter(
        a =>
          a.firstNamedChild !== null &&
          a.firstNamedChild.type === "function_declaration_left" &&
          a.firstNamedChild.firstNamedChild !== null &&
          a.firstNamedChild.firstNamedChild.type === "lower_case_identifier",
      );
      for (const declaration of declarations) {
        const value = HintHelper.createHint(declaration);
        completions.push(
          this.createFunctionCompletion(
            value,
            declaration.firstNamedChild!.firstNamedChild!.text,
          ),
        );
      }
    }
    // Add types
    const typeDeclarations = TreeUtils.findAllTypeDeclarations(tree);
    if (typeDeclarations) {
      for (const declaration of typeDeclarations) {
        const value = HintHelper.createHint(declaration);
        const name = TreeUtils.findFirstNamedChildOfType(
          "upper_case_identifier",
          declaration,
        );
        if (name) {
          completions.push(this.createTypeCompletion(value, name.text));
        }
        // Add types constuctors
        const unionVariants = declaration.descendantsOfType("union_variant");
        for (const unionVariant of unionVariants) {
          const unionVariantName = TreeUtils.findFirstNamedChildOfType(
            "upper_case_identifier",
            unionVariant,
          );
          if (unionVariantName) {
            completions.push(
              this.createUnionConstructorCompletion(unionVariantName.text),
            );
          }
        }
      }
    }
    // Add alias types
    const typeAliasDeclarations = TreeUtils.findAllTypeAliasDeclarations(tree);
    if (typeAliasDeclarations) {
      for (const declaration of typeAliasDeclarations) {
        const value = HintHelper.createHint(declaration);
        const name = TreeUtils.findFirstNamedChildOfType(
          "upper_case_identifier",
          declaration,
        );
        if (name) {
          completions.push(this.createTypeAliasCompletion(value, name.text));
        }
      }
    }

    return completions;
  }

  private createFunctionCompletion(
    markdownDocumentation: string | undefined,
    label: string,
  ): CompletionItem {
    return this.createCompletion(
      markdownDocumentation,
      SymbolKind.Function,
      label,
    );
  }

  private createTypeCompletion(
    markdownDocumentation: string | undefined,
    label: string,
  ): CompletionItem {
    return this.createCompletion(markdownDocumentation, SymbolKind.Enum, label);
  }

  private createTypeAliasCompletion(
    markdownDocumentation: string | undefined,
    label: string,
  ): CompletionItem {
    return this.createCompletion(
      markdownDocumentation,
      SymbolKind.Struct,
      label,
    );
  }

  private createOperatorCompletion(
    markdownDocumentation: string | undefined,
    label: string,
  ): CompletionItem {
    return this.createCompletion(
      markdownDocumentation,
      SymbolKind.Operator,
      label,
    );
  }

  private createUnionConstructorCompletion(label: string): CompletionItem {
    return this.createCompletion(undefined, SymbolKind.EnumMember, label);
  }

  private createCompletion(
    markdownDocumentation: string | undefined,
    kind: CompletionItemKind,
    label: string,
  ): CompletionItem {
    return {
      documentation: {
        kind: MarkupKind.Markdown,
        value: markdownDocumentation ? markdownDocumentation : "",
      },
      kind,
      label,
    };
  }
}
