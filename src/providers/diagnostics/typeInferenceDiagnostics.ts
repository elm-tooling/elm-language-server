/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Diagnostic, Range } from "vscode-languageserver";
import { IElmWorkspace } from "../../elmWorkspace";
import { InferenceScope } from "../../util/types/typeInference";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { PositionUtil } from "../../positionUtil";
import { mapSyntaxNodeToTypeTree } from "../../util/types/expressionTree";

export class TypeInferenceDiagnostics {
  public createDiagnostics = (
    tree: Tree,
    uri: string,
    elmWorkspace: IElmWorkspace,
  ): Map<string, Diagnostic[]> => {
    const diagnostics = new Map<string, Diagnostic[]>();

    diagnostics.set(
      uri,
      tree.rootNode.children
        .filter((n) => n.type === "value_declaration")
        .flatMap((node) => {
          const mappedNode = mapSyntaxNodeToTypeTree(node);
          if (mappedNode) {
            return new InferenceScope(
              uri,
              elmWorkspace.getForest(),
              elmWorkspace.getImports(),
              new Set(),
            )
              .inferDeclaration(mappedNode, true)
              .diagnostics.map((d) => {
                return { range: getNodeRange(d.node), message: d.message };
              });
          } else {
            return [];
          }
        }) ?? [],
    );

    return diagnostics;
  };
}

function getNodeRange(node: SyntaxNode): Range {
  const end = PositionUtil.FROM_TS_POSITION(node.endPosition).toVSPosition();
  return {
    start: PositionUtil.FROM_TS_POSITION(node.startPosition).toVSPosition(),
    end: {
      ...end,
      character: end.character + 1,
    },
  };
}
