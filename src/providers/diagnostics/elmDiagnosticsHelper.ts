import path from "path";
import { Diagnostic, DiagnosticSeverity, Range } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { Diagnostics } from "../../util/types/diagnostics";
import { IElmIssue } from "./diagnosticsProvider";
import { NAMING_ERROR } from "./elmMakeDiagnostics";

export class ElmDiagnosticsHelper {
  public static issuesToDiagnosticMap(
    issues: IElmIssue[],
    elmWorkspaceFolder: URI,
  ): Map<string, Diagnostic[]> {
    return issues.reduce((acc, issue) => {
      const uri = this.getUriFromIssue(issue, elmWorkspaceFolder);
      const diagnostic = this.elmMakeIssueToDiagnostic(issue);
      const arr = acc.get(uri) ?? [];
      arr.push(diagnostic);
      acc.set(uri, arr);
      return acc;
    }, new Map<string, Diagnostic[]>());
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
    return URI.file(
      path.join(elmWorkspaceFolder.fsPath, issue.file),
    ).toString();
  }

  private static elmMakeIssueToDiagnostic(issue: IElmIssue): Diagnostic {
    const lineRange: Range = Range.create(
      issue.region.start.line - 1,
      issue.region.start.column - 1,
      issue.region.end.line - 1,
      issue.region.end.column - 1,
    );

    const messagePrefix = issue.overview ? `${issue.overview} - ` : "";

    let code = undefined;

    if (issue.overview.startsWith(NAMING_ERROR)) {
      code = Diagnostics.MissingValue.code;
    }

    return Diagnostic.create(
      lineRange,
      `${messagePrefix}${issue.details.replace(/\[\d+m/g, "")}`,
      this.severityStringToDiagnosticSeverity(issue.type),
      code,
      "Elm",
    );
  }
}
