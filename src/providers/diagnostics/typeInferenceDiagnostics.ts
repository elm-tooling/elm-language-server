/* eslint-disable @typescript-eslint/no-use-before-define */
import { CancellationToken } from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { TreeUtils } from "../../util/treeUtils";
import { mapSyntaxNodeToExpression } from "../../util/types/expressionTree";
import { TypeChecker } from "../../util/types/typeChecker";
import { ITreeContainer } from "../../forest";
import { IElmWorkspace } from "../../elmWorkspace";
import { ServerCancellationToken } from "../../cancellation";
import { Diagnostic, Diagnostics, error } from "../../util/types/diagnostics";
import { IDiagnostic } from "./diagnosticsProvider";

export function convertFromAnalyzerDiagnostic(diag: Diagnostic): IDiagnostic {
  return {
    message: diag.message,
    source: diag.source,
    severity: diag.severity,
    range: diag.range,
    data: {
      uri: diag.uri,
      code: diag.code,
    },
  };
}

export class TypeInferenceDiagnostics {
  TYPE_INFERENCE = "Type Inference";

  public getDiagnosticsForFileAsync(
    treeContainer: ITreeContainer,
    program: IElmWorkspace,
    cancellationToken: CancellationToken,
  ): Promise<IDiagnostic[]> {
    const checker = program.getTypeChecker();

    const diagnostics: IDiagnostic[] = [];

    diagnostics.push(
      ...treeContainer.parseDiagnostics.map(convertFromAnalyzerDiagnostic),
    );

    const allTopLevelFunctions =
      TreeUtils.findAllTopLevelFunctionDeclarations(treeContainer.tree) ?? [];

    return new Promise((resolve, reject) => {
      program
        .getDiagnosticsAsync(
          treeContainer,
          new ServerCancellationToken(cancellationToken),
        )
        .then((diag) => {
          diagnostics.push(...diag.map(convertFromAnalyzerDiagnostic));

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
  ): IDiagnostic[] {
    const valueDeclaration = mapSyntaxNodeToExpression(declaration);
    if (valueDeclaration?.nodeType !== "ValueDeclaration") {
      return [];
    }

    const diagnostics: IDiagnostic[] = [];

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
          convertFromAnalyzerDiagnostic(
            error(
              declaration.firstNamedChild.firstNamedChild,
              Diagnostics.MissingTypeAnnotation,
              typeString,
            ),
          ),
        );
      }
    }

    return diagnostics;
  }
}
