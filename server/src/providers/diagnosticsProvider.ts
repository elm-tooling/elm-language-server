import * as cp from "child_process";
import * as readline from "readline";
import * as utils from "../util/elmUtils";

import URI from "vscode-uri";

import {
    Diagnostic,
    DiagnosticSeverity,
    IConnection,
    Range,
} from "vscode-languageserver";

export interface IElmIssueRegion {
    start: { line: number; column: number };
    end: { line: number; column: number };
}

export interface IElmIssue {
    tag: string;
    overview: string;
    subregion: string;
    details: string;
    region: IElmIssueRegion;
    type: string;
    file: string;
}

export class DiagnosticsProvider {
    private connection: IConnection;

    constructor(connection: IConnection) {
        this.connection = connection;

        this.connection.onDidSaveTextDocument(this.handleTextdocumentChanged);
    }

    protected handleTextdocumentChanged = async (
        param,
    ) => {
        const b = param.textDocument.uri;
        const diagnostics: Diagnostic[] = [];

        // this.connection.sendDiagnostics({
        //     uri: document.uri,
        //     diagnostics: issue.map((error) => elmMakeIssueToDiagnostic(error)));

        const compileErrors: Diagnostic[] = [];
        const uri: URI = URI.parse(param.textDocument.uri);

        this.checkForErrors(this.connection, "", uri.fsPath)
            .then((compilerErrors: IElmIssue[]) => {
                // const cwd: string = rootPath;
                const cwd: string = uri.fsPath;
                const splitCompilerErrors: Map<string, IElmIssue[]> = new Map();

                compilerErrors.forEach((issue: IElmIssue) => {
                    // If provided path is relative, make it absolute
                    if (issue.file.startsWith(".")) {
                        issue.file = cwd + issue.file.slice(1);
                    }
                    if (splitCompilerErrors.has(issue.file)) {
                        splitCompilerErrors.get(issue.file).push(issue);
                    } else {
                        splitCompilerErrors.set(issue.file, [issue]);
                    }
                });
                // Turn split arrays into diagnostics and associate them with correct files in VS
                splitCompilerErrors.forEach((issue: IElmIssue[], path: string) => {
                    this.connection.sendDiagnostics({
                        diagnostics: issue.map((error) => this.elmMakeIssueToDiagnostic(error)),
                        uri: param.textDocument.uri,
                    });
                });
            })
            .catch((error) => {
                this.connection.console.error("Error when creating diagnostics.");
            });
    }
    // todo fix rootpath
    private checkForErrors(connection: IConnection, rootPath: string, filename: string) {
        return new Promise((resolve, reject) => {
            const makeCommand: string = "elm";
            const cwd: string = rootPath;
            let make: cp.ChildProcess;
            if (utils.isWindows) {
                filename = "\"" + filename + "\"";
            }
            const args = ["make", filename, "--report", "json", "--output", "/dev/null"];
            if (utils.isWindows) {
                make = cp.exec(makeCommand + " " + args.join(" "), { cwd });
            } else {
                make = cp.spawn(makeCommand, args, { cwd });
            }
            // output is actually optional
            // (fixed in https://github.com/Microsoft/vscode/commit/b4917afe9bdee0e9e67f4094e764f6a72a997c70,
            // but unreleased at this time)
            const errorLinesFromElmMake: readline.ReadLine = readline.createInterface({
                input: make.stderr,
                output: undefined,
            });
            const lines: IElmIssue[] = [];
            errorLinesFromElmMake.on("line", (line: string) => {
                lines.push(...(JSON.parse(line) as IElmIssue[]));
            });
            make.on("error", (err: Error) => {
                errorLinesFromElmMake.close();
                if (err && (err as any).code === "ENOENT") {
                    connection.console.log(
                        "The 'elm make' compiler is not available.  Install Elm from http://elm-lang.org/.",
                    );
                    resolve([]);
                } else {
                    reject(err);
                }
            });
            make.on("close", (code: number, signal: string) => {
                errorLinesFromElmMake.close();

                resolve(lines);
            });
        });
    }

    private severityStringToDiagnosticSeverity(
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

    private elmMakeIssueToDiagnostic(issue: IElmIssue): Diagnostic {
        const lineRange: Range = Range.create(
            issue.region.start.line - 1,
            issue.region.start.column - 1,
            issue.region.end.line - 1,
            issue.region.end.column - 1,
        );
        return Diagnostic.create(
            lineRange,
            issue.overview + " - " + issue.details.replace(/\[\d+m/g, ""),
            this.severityStringToDiagnosticSeverity(issue.type),
        );
    }
}
