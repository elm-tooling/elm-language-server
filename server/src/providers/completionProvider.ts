import { SyntaxNode, Tree } from "tree-sitter";
import { CompletionItem, CompletionParams, CompletionRequest, IConnection } from "vscode-languageserver";
import { IForest } from "../forest";

export class CompletionProvider {
    private connection: IConnection;
    private forest: IForest;

    constructor(connection: IConnection, forest: IForest) {
        this.connection = connection;
        this.forest = forest;

        this.connection.onRequest(CompletionRequest.type, this.handleCompletionRequest);
    }

    protected handleCompletionRequest = async (
        param: CompletionParams,
    ): Promise<CompletionItem[]> => {
        const completions: CompletionItem[] = [];

        const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

        const traverse: (node: SyntaxNode) => void = (node: SyntaxNode): void => {
            if (node.type === "func_identifier" && !completions.some((a) => a.label === node.text)) {
                completions.push({
                    kind: 3,
                    label: node.text,
                });
            } else if (node.type === "custom_type_identifier" && !completions.some((a) => a.label === node.text)) {
                completions.push({
                    kind: 22,
                    label: node.text,
                });
            }
            for (const childNode of node.children) {
                traverse(childNode);
            }
        };
        if (tree) {
            traverse(tree.rootNode);
        }

        return completions;
    }
}
