import { container } from "tsyringe";
import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  CodeActionResolveRequest,
  Connection,
  Diagnostic as LspDiagnostic,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { IElmWorkspace } from "../elmWorkspace";
import { ITreeContainer } from "../forest";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { MultiMap } from "../util/multiMap";
import { Settings } from "../util/settings";
import { flatMap } from "../util/treeUtils";
import { Diagnostic } from "../util/types/diagnostics";
import {
  convertFromAnalyzerDiagnostic,
  DiagnosticsProvider,
  IDiagnostic,
} from "./diagnostics/diagnosticsProvider";
import { ElmLsDiagnostics } from "./diagnostics/elmLsDiagnostics";
import { ElmMakeDiagnostics } from "./diagnostics/elmMakeDiagnostics";
import { diagnosticsEquals } from "./diagnostics/fileDiagnostics";
import { ExposeUnexposeHandler } from "./handlers/exposeUnexposeHandler";
import { MoveRefactoringHandler } from "./handlers/moveRefactoringHandler";
import { ICodeActionParams } from "./paramsExtensions";

export interface ICodeActionRegistration {
  errorCodes: string[];
  fixId: string;
  getCodeActions(params: ICodeActionParams): CodeAction[] | undefined;
  getFixAllCodeAction(params: ICodeActionParams): CodeAction | undefined;
}

export interface IRefactorCodeAction extends CodeAction {
  data: {
    uri: string;
    refactorName: string;
    actionName: string;
    range: Range;
  };
}

export interface IRefactorRegistration {
  getAvailableActions(params: ICodeActionParams): IRefactorCodeAction[];
  getEditsForAction(
    params: ICodeActionParams,
    actionName: string,
  ): TextEdit[] | undefined;
}

export class CodeActionProvider {
  private connection: Connection;
  private settings: Settings;
  private elmMake: ElmMakeDiagnostics;
  private elmDiagnostics: ElmLsDiagnostics;
  private diagnosticsProvider: DiagnosticsProvider;

  private static errorCodeToRegistrationMap = new MultiMap<
    string,
    ICodeActionRegistration
  >();
  private static refactorRegistrations = new Map<
    string,
    IRefactorRegistration
  >();

  constructor() {
    this.settings = container.resolve("Settings");
    this.elmMake = container.resolve(ElmMakeDiagnostics);
    this.elmDiagnostics = container.resolve(ElmLsDiagnostics);
    this.connection = container.resolve<Connection>("Connection");
    this.diagnosticsProvider = container.resolve(DiagnosticsProvider);

    this.onCodeAction = this.onCodeAction.bind(this);
    this.connection.onCodeAction(
      this.diagnosticsProvider.interruptDiagnostics(() =>
        new ElmWorkspaceMatcher((param: CodeActionParams) =>
          URI.parse(param.textDocument.uri),
        ).handle(this.onCodeAction.bind(this)),
      ),
    );

    this.connection.onRequest(
      CodeActionResolveRequest.method,
      new ElmWorkspaceMatcher((codeAction: IRefactorCodeAction) =>
        URI.parse(codeAction.data.uri),
      ).handleResolve((codeAction, program, sourceFile) =>
        this.onCodeActionResolve(codeAction, program, sourceFile),
      ),
    );

    if (this.settings.extendedCapabilities?.moveFunctionRefactoringSupport) {
      new MoveRefactoringHandler();
    }

    new ExposeUnexposeHandler();
  }

  public static registerCodeAction(
    registration: ICodeActionRegistration,
  ): void {
    registration.errorCodes.forEach((code) => {
      CodeActionProvider.errorCodeToRegistrationMap.set(code, registration);
    });
  }

  public static registerRefactorAction(
    name: string,
    registration: IRefactorRegistration,
  ): void {
    this.refactorRegistrations.set(name, registration);
  }

  private static getDiagnostics(params: ICodeActionParams): Diagnostic[] {
    return [
      ...params.program.getSyntacticDiagnostics(params.sourceFile),
      ...params.program.getSemanticDiagnostics(params.sourceFile),
      ...params.program.getSuggestionDiagnostics(params.sourceFile),
    ];
  }

  private static forEachDiagnostic(
    params: ICodeActionParams,
    errorCodes: string[],
    callback: (diagnostic: Diagnostic) => void,
  ): void {
    CodeActionProvider.getDiagnostics(params).forEach((diagnostic) => {
      if (
        typeof diagnostic.code === "string" &&
        errorCodes.includes(diagnostic.code)
      ) {
        callback(diagnostic);
      }
    });
  }

  public static getCodeAction(
    params: ICodeActionParams,
    title: string,
    edits: TextEdit[],
  ): CodeAction {
    const changes = { [params.sourceFile.uri]: edits };
    return {
      title,
      kind: CodeActionKind.QuickFix,
      edit: { changes },
      isPreferred: true,
    };
  }

  public static getFixAllCodeAction(
    title: string,
    params: ICodeActionParams,
    errorCodes: string[],
    fixId: string,
    callback: (edits: TextEdit[], diagnostic: LspDiagnostic) => void,
  ): CodeAction {
    const edits: TextEdit[] = [];
    const changes = {
      [params.sourceFile.uri]: edits,
    };

    const diagnostics: LspDiagnostic[] = [];
    CodeActionProvider.forEachDiagnostic(params, errorCodes, (diagnostic) => {
      diagnostics.push(diagnostic);
      callback(edits, diagnostic);
    });

    return {
      title,
      kind: CodeActionKind.QuickFix,
      diagnostics,
      edit: { changes },
      data: fixId,
    };
  }

  protected onCodeAction(params: ICodeActionParams): CodeAction[] | undefined {
    this.connection.console.info("A code action was requested");
    const make = this.elmMake.onCodeAction(params);
    const elmDiagnostics = this.elmDiagnostics.onCodeAction(params);

    const results: CodeAction[] = [];

    // For each diagnostic in the context, get the code action registration that
    // handles the diagnostic error code and ask for the code actions for that error
    // and the fix all code action for that error if there are other diagnostics with
    // the same error code
    (<IDiagnostic[]>params.context.diagnostics).forEach((diagnostic) => {
      const registrations = CodeActionProvider.errorCodeToRegistrationMap.getAll(
        diagnostic.data.code,
      );

      // Set the params range to the diagnostic range so we get the correct nodes
      params.range = diagnostic.range;

      results.push(
        ...flatMap(registrations, (reg) => {
          const codeActions =
            reg
              .getCodeActions(params)
              ?.map((codeAction) =>
                this.addDiagnosticToCodeAction(codeAction, diagnostic),
              ) ?? [];

          if (
            codeActions.length > 0 &&
            !results.some(
              // Check if there is already a "fix all" code action for this fix
              (codeAction) => /* fixId */ codeAction.data === reg.fixId,
            ) &&
            CodeActionProvider.getDiagnostics(params).some(
              (diag) =>
                !diagnosticsEquals(
                  convertFromAnalyzerDiagnostic(diag),
                  diagnostic,
                ) && diag.code === diagnostic.data.code,
            )
          ) {
            const fixAllCodeAction = reg.getFixAllCodeAction(params);

            if (fixAllCodeAction) {
              codeActions?.push(fixAllCodeAction);
            }
          }

          return codeActions;
        }),
      );
    });

    results.push(
      ...flatMap(
        Array.from(CodeActionProvider.refactorRegistrations.values()),
        (registration) => registration.getAvailableActions(params),
      ),
    );

    return [...results, ...make, ...elmDiagnostics];
  }

  private onCodeActionResolve(
    codeAction: IRefactorCodeAction,
    program: IElmWorkspace,
    sourceFile: ITreeContainer,
  ): IRefactorCodeAction {
    const edits = CodeActionProvider.refactorRegistrations
      .get(codeAction.data.refactorName)
      ?.getEditsForAction(
        {
          textDocument: {
            uri: codeAction.data.uri,
          },
          context: { diagnostics: [] },
          range: codeAction.data.range,
          program,
          sourceFile,
        },
        codeAction.data.actionName,
      );

    if (edits) {
      codeAction.edit = { changes: { [codeAction.data.uri]: edits } };
    }

    return codeAction;
  }

  private addDiagnosticToCodeAction(
    codeAction: CodeAction,
    diagnostic: LspDiagnostic,
  ): CodeAction {
    codeAction.diagnostics = [diagnostic];
    return codeAction;
  }
}
