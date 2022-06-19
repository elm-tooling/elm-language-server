import { DiagnosticSeverity, Range } from "vscode-languageserver";
import { URI, Utils } from "vscode-uri";
import { Diagnostics } from "../../compiler/diagnostics.js";
import { IDiagnostic, IElmIssue } from "./diagnosticsProvider.js";
import { NAMING_ERROR } from "./elmMakeDiagnostics.js";

export class ElmDiagnosticsHelper {
  public static issuesToDiagnosticMap(
    issues: IElmIssue[],
    elmWorkspaceFolder: URI,
  ): Map<string, IDiagnostic[]> {
    return issues.reduce((acc, issue) => {
      const uri = this.getUriFromIssue(issue, elmWorkspaceFolder);
      const diagnostic = this.elmMakeIssueToDiagnostic(issue);
      const arr = acc.get(uri) ?? [];
      arr.push(diagnostic);
      acc.set(uri, arr);
      return acc;
    }, new Map<string, IDiagnostic[]>());
  }

  private static severityStringToDiagnosticSeverity(
    severity: string,
  ): DiagnosticSeverity {
    switch (severity) {
      case "error":
        return DiagnosticSeverity.Error;
      case "warning":
        return DiagnosticSeverity.Warning;
      default:
        return DiagnosticSeverity.Error;
    }
  }

  private static getUriFromIssue(
    issue: IElmIssue,
    elmWorkspaceFolder: URI,
  ): string {
    return Utils.joinPath(elmWorkspaceFolder, issue.file).toString();
  }

  private static elmMakeIssueToDiagnostic(issue: IElmIssue): IDiagnostic {
    const lineRange: Range = Range.create(
      issue.region.start.line - 1,
      issue.region.start.column - 1,
      issue.region.end.line - 1,
      issue.region.end.column - 1,
    );

    const messagePrefix = issue.overview ? `${issue.overview} - ` : "";

    let code = "elm_make";

    if (issue.overview.startsWith(NAMING_ERROR)) {
      code = Diagnostics.MissingValue.code;
    }

    if (issue.overview.startsWith("MODULE NOT FOUND")) {
      code = Diagnostics.ImportMissing.code;
    }

    if (issue.overview.startsWith("MISSING PATTERNS - This `case`")) {
      code = Diagnostics.IncompleteCasePattern(0).code;
    }

    return {
      range: lineRange,
      message: `${messagePrefix}${issue.details.replace(/\[\d+m/g, "")}`,
      severity: this.severityStringToDiagnosticSeverity(issue.type),
      source: "Elm",
      data: { uri: issue.file, code },
    };
  }
}
