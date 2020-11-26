/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  CancellationToken,
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  DiagnosticSeverity,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { PositionUtil } from "../../positionUtil";
import { TreeUtils } from "../../util/treeUtils";
import { URI } from "vscode-uri";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { mapSyntaxNodeToExpression } from "../../util/types/expressionTree";
import { MultistepOperation } from "../../util/multistepOperation";
import { TypeChecker } from "../../util/types/typeChecker";
import { ITreeContainer } from "../../forest";
import { IElmWorkspace } from "../../elmWorkspace";
import {
  ICancellationToken,
  ThrottledCancellationToken,
} from "../../cancellation";
import { container } from "tsyringe";
import { Diagnostics, error } from "../../util/types/diagnostics";

export class TypeInferenceDiagnostics {
  TYPE_INFERENCE = "Type Inference";

  private elmWorkspaceMatcher: ElmWorkspaceMatcher<URI>;
  private changeSeq = 0;

  private operation: MultistepOperation;

  constructor() {
    this.elmWorkspaceMatcher = new ElmWorkspaceMatcher((uri) => uri);
    this.operation = new MultistepOperation(container.resolve("Connection"));
  }

  public change(): void {
    this.changeSeq++;
  }

  public getDiagnosticsForFile(
    treeContainer: ITreeContainer,
    elmWorkspace: IElmWorkspace,
    cancellationToken: CancellationToken,
  ): Promise<Diagnostic[]> {
    const checker = elmWorkspace.getTypeChecker();

    const diagnostics: Diagnostic[] = [];

    diagnostics.push(...treeContainer.parseDiagnostics);

    const allTopLevelFunctions =
      TreeUtils.findAllTopLevelFunctionDeclarations(treeContainer.tree) ?? [];

    return new Promise((resolve, reject) => {
      this.operation.startNew(
        cancellationToken,
        (next) => {
          const seq = this.changeSeq;

          let index = 0;
          const goNext = (): void => {
            index++;
            if (allTopLevelFunctions.length > index) {
              next.immediate(checkOne);
            }
          };

          const checkOne = (): void => {
            if (this.changeSeq !== seq) {
              reject();
            }

            diagnostics.push(
              ...this.getDiagnosticsForDeclaration(
                checker,
                allTopLevelFunctions[index],
                treeContainer,
                new ThrottledCancellationToken(cancellationToken),
              ),
            );

            goNext();
          };

          if (allTopLevelFunctions.length > 0 && this.changeSeq === seq) {
            next.immediate(checkOne);
          }
        },
        () => {
          resolve(diagnostics);
        },
        reject,
      );
    });
  }

  public getDiagnosticsForDeclaration(
    checker: TypeChecker,
    declaration: SyntaxNode,
    treeContainer: ITreeContainer,
    cancellationToken: ICancellationToken,
  ): Diagnostic[] {
    const valueDeclaration = mapSyntaxNodeToExpression(declaration);
    if (valueDeclaration?.nodeType !== "ValueDeclaration") {
      return [];
    }

    const diagnostics: Diagnostic[] = [];

    checker
      .getDiagnosticsFromDeclaration(valueDeclaration, cancellationToken)
      .forEach((diagnostic) => {
        const nodeUri = (<any>diagnostic.data).uri;

        if (nodeUri === treeContainer.uri) {
          diagnostics.push(diagnostic);
        }
      });

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
