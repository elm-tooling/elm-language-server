/* eslint-disable @typescript-eslint/no-use-before-define */
import { CancellationToken, Diagnostic } from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { TreeUtils } from "../../util/treeUtils";
import { mapSyntaxNodeToExpression } from "../../util/types/expressionTree";
import { TypeChecker } from "../../util/types/typeChecker";
import { ITreeContainer } from "../../forest";
import { IElmWorkspace } from "../../elmWorkspace";
import { ServerCancellationToken } from "../../cancellation";
import { Diagnostics, error } from "../../util/types/diagnostics";

export class TypeInferenceDiagnostics {
  TYPE_INFERENCE = "Type Inference";

  public getDiagnosticsForFileAsync(
    treeContainer: ITreeContainer,
    program: IElmWorkspace,
    cancellationToken: CancellationToken,
  ): Promise<Diagnostic[]> {
    const checker = program.getTypeChecker();

    const diagnostics: Diagnostic[] = [];

    diagnostics.push(...treeContainer.parseDiagnostics);

    const allTopLevelFunctions =
      TreeUtils.findAllTopLevelFunctionDeclarations(treeContainer.tree) ?? [];

    return new Promise((resolve, reject) => {
      program
        .getDiagnosticsAsync(
          treeContainer,
          new ServerCancellationToken(cancellationToken),
        )
        .then((diag) => {
          diagnostics.push(...diag);

          // Get other custom diagnostics
          allTopLevelFunctions.forEach((declaration) => {
            diagnostics.push(
              ...this.getDiagnosticsForDeclaration(
                checker,
                declaration,
                treeContainer,
              ),
            );
          });

          resolve(diagnostics);
        })
        .catch(reject);
    });
  }

  public getDiagnosticsForDeclaration(
    checker: TypeChecker,
    declaration: SyntaxNode,
    treeContainer: ITreeContainer,
  ): Diagnostic[] {
    const valueDeclaration = mapSyntaxNodeToExpression(declaration);
    if (valueDeclaration?.nodeType !== "ValueDeclaration") {
      return [];
    }

    const diagnostics: Diagnostic[] = [];

    if (!valueDeclaration.typeAnnotation) {
      const typeString: string = checker.typeToString(
        checker.findType(declaration),
        treeContainer,
      );

      if (
        typeString &&
        typeString !== "unknown" &&
        declaration.firstNamedChild?.firstNamedChild
      ) {
        diagnostics.push(
          error(
            declaration.firstNamedChild.firstNamedChild,
            Diagnostics.MissingTypeAnnotation,
            typeString,
          ),
        );
      }
    }

    return diagnostics;
  }
}
