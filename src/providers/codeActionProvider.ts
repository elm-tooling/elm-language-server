import { readFile } from "fs";
import { container } from "tsyringe";
import { promisify } from "util";
import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  CodeActionResolveRequest,
  Command,
  Connection,
  Diagnostic as LspDiagnostic,
  Position,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { ElmJson, IProgram } from "../compiler/program";
import { ISourceFile } from "../compiler/forest";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { MultiMap } from "../util/multiMap";
import { Settings } from "../util/settings";
import { Diagnostic } from "../compiler/diagnostics";
import {
  convertFromCompilerDiagnostic,
  convertToCompilerDiagnostic,
  DiagnosticsProvider,
  IDiagnostic,
} from "./diagnostics/diagnosticsProvider";
import { ElmMakeDiagnostics } from "./diagnostics/elmMakeDiagnostics";
import {
  DiagnosticKind,
  diagnosticsEquals,
} from "./diagnostics/fileDiagnostics";
import { ExposeUnexposeHandler } from "./handlers/exposeUnexposeHandler";
import { MoveRefactoringHandler } from "./handlers/moveRefactoringHandler";
import { ICodeActionParams } from "./paramsExtensions";
import { ElmPackageCache } from "../compiler/elmPackageCache";
import { comparePosition } from "../positionUtil";

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
    renamePosition?: Position;
  };
}

export interface IRefactorEdit {
  edits?: TextEdit[];
  renamePosition?: Position;
}
export interface IRefactorRegistration {
  getAvailableActions(params: ICodeActionParams): IRefactorCodeAction[];
  getEditsForAction(
    params: ICodeActionParams,
    actionName: string,
  ): IRefactorEdit;
}

export class CodeActionProvider {
  private connection: Connection;
  private settings: Settings;
  private elmMake: ElmMakeDiagnostics;
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

    setTimeout(() => {
      void new ElmPackageCache(
        async (path) =>
          JSON.parse(
            await promisify(readFile)(path, { encoding: "utf-8" }),
          ) as ElmJson,
      ).loadAllPackageModules();
    }, 5000);
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

  private static getDiagnostics(
    params: ICodeActionParams,
    diagnosticProvider: DiagnosticsProvider,
  ): Diagnostic[] {
    return [
      ...params.program.getSyntacticDiagnostics(params.sourceFile),
      ...params.program.getSemanticDiagnostics(params.sourceFile),
      ...params.program.getSuggestionDiagnostics(params.sourceFile),
      ...diagnosticProvider
        .getCurrentDiagnostics(params.sourceFile.uri, DiagnosticKind.ElmLS)
        .map(convertToCompilerDiagnostic),
    ];
  }

  private static forEachDiagnostic(
    params: ICodeActionParams,
    errorCodes: string[],
    callback: (diagnostic: Diagnostic) => void,
  ): void {
    const diagnosticProvider = container.resolve(DiagnosticsProvider);
    CodeActionProvider.getDiagnostics(params, diagnosticProvider).forEach(
      (diagnostic) => {
        if (
          typeof diagnostic.code === "string" &&
          errorCodes.includes(diagnostic.code)
        ) {
          callback(diagnostic);
        }
      },
    );
  }

  public static getCodeAction(
    params: ICodeActionParams,
    title: string,
    edits: TextEdit[] | { [uri: string]: TextEdit[] },
    command?: Command,
  ): CodeAction {
    const changes = Array.isArray(edits)
      ? { [params.sourceFile.uri]: edits }
      : edits;
    return {
      title,
      kind: CodeActionKind.QuickFix,
      edit: { changes },
      isPreferred: true,
      command,
    };
  }

  public static getFixAllCodeAction(
    title: string,
    params: ICodeActionParams,
    errorCodes: string[],
    fixId: string,
    callback: (edits: TextEdit[], diagnostic: Diagnostic) => void,
    callbackChanges?: (
      edits: { [uri: string]: TextEdit[] },
      diagnostic: Diagnostic,
    ) => void,
  ): CodeAction {
    const edits: TextEdit[] = [];
    const changes = callbackChanges
      ? {}
      : {
          [params.sourceFile.uri]: edits,
        };

    const diagnostics: Diagnostic[] = [];
    CodeActionProvider.forEachDiagnostic(params, errorCodes, (diagnostic) => {
      diagnostics.push(diagnostic);
      if (callbackChanges) {
        callbackChanges(changes, diagnostic);
      } else {
        callback(edits, diagnostic);
      }
    });

    const sortedEdits = edits.sort((a, b) =>
      comparePosition(a.range.start, b.range.start),
    );

    // Using object mutation here to fix the ranges
    sortedEdits.forEach((edit, i) => {
      const lastEditEnd = sortedEdits[i - 1]?.range.end;
      const newEditStart = edit.range.start;

      // Handle if the ranges overlap
      if (
        lastEditEnd &&
        newEditStart &&
        comparePosition(lastEditEnd, newEditStart) > 0
      ) {
        edit.range.start = lastEditEnd;

        if (comparePosition(edit.range.end, edit.range.start) < 0) {
          edit.range.end = edit.range.start;
        }
      }
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

      if (registrations) {
        results.push(
          ...registrations.flatMap((reg) => {
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
              CodeActionProvider.getDiagnostics(
                params,
                this.diagnosticsProvider,
              ).some(
                (diag) =>
                  !diagnosticsEquals(
                    convertFromCompilerDiagnostic(diag),
                    diagnostic,
                  ) && reg.errorCodes.includes(diag.code),
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
      }
    });

    results.push(
      ...Array.from(
        CodeActionProvider.refactorRegistrations.values(),
      ).flatMap((registration) => registration.getAvailableActions(params)),
    );

    return [...results, ...make];
  }

  private onCodeActionResolve(
    codeAction: IRefactorCodeAction,
    program: IProgram,
    sourceFile: ISourceFile,
  ): IRefactorCodeAction {
    const result = CodeActionProvider.refactorRegistrations
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

    if (result?.edits) {
      codeAction.edit = { changes: { [codeAction.data.uri]: result.edits } };
    }

    if (result?.renamePosition) {
      codeAction.data.renamePosition = result.renamePosition;
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
