/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  CancellationToken,
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  TextEdit,
} from "vscode-languageserver";
import { TreeUtils } from "../../util/treeUtils";
import { URI } from "vscode-uri";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { MultistepOperation } from "../../util/multistepOperation";
import { ITreeContainer } from "../../forest";
import { IElmWorkspace } from "../../elmWorkspace";
import { ThrottledCancellationToken } from "../../cancellation";
import { container } from "tsyringe";

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
              ...checker.getDiagnosticsFromDeclaration(
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
          if (diagnostics.length === 0) {
            console.log();
          }
          resolve(diagnostics);
        },
        reject,
      );
    });
  }
}
