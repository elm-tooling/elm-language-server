import path from "path";
import { DiagnosticSeverity, Range } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { UriString } from "../../uri";
import { Diagnostics } from "../../util/types/diagnostics";
import { IDiagnostic, IElmIssue } from "./diagnosticsProvider";
import { NAMING_ERROR } from "./elmMakeDiagnostics";

export class ElmDiagnosticsHelper {
  public static issuesToDiagnosticMap(
    issues: IElmIssue[],
    elmWorkspaceFolder: URI,
  ): Map<UriString, IDiagnostic[]> {
    return issues.reduce((acc, issue) => {
      const uri = this.getUriFromIssue(issue, elmWorkspaceFolder);
      const diagnostic = this.elmMakeIssueToDiagnostic(issue);
      const arr = acc.get(uri.toString()) ?? [];
      arr.push(diagnostic);
      acc.set(uri.toString(), arr);
      return acc;
    }, new Map<UriString, IDiagnostic[]>());
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
  ): URI {
    return URI.file(path.join(elmWorkspaceFolder.fsPath, issue.file));
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

    return {
      range: lineRange,
      message: `${messagePrefix}${issue.details.replace(/\[\d+m/g, "")}`,
      severity: this.severityStringToDiagnosticSeverity(issue.type),
      source: "Elm",
      data: { uri: URI.file(issue.file), code },
    };
  }
}
