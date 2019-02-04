import * as path from "path";
import request = require("request");
import {
    Diagnostic,
    DiagnosticSeverity, DidSaveTextDocumentParams,
    IConnection, PublishDiagnosticsParams, Range,
} from "vscode-languageserver";
import URI from "vscode-uri";
import WebSocket = require("ws");
import { execCmd, IExecutingCmd } from "../util/elmUtils";
import { IElmIssue, IElmIssueRegion } from "./diagnosticsProvider";

enum ElmAnalyseServerState {
    NotRunning = 1,
    PortInUse,
    Running,
}

interface IElmAnalyseMessage {
    type: string;
    file: string;
    data: IElmAnalyseMessageData;
}

interface IElmAnalyseMessageData {
    description: string;
    properties:
    | { range: number[] }
    | { range1: number[]; range2: number[] }
    | { ranges: number[][] };
}

interface IElmAnalyseMessageParseResult {
    success: boolean;
    issues: IElmIssue[];
    reason: string;
    messageType: string;
}

export class ElmAnalyseDiagnostics {

    private connection: IConnection;
    private elmWorkspaceFolder: URI;
    private analyseSocket: WebSocket;
    private analyse: IExecutingCmd;

    constructor(connection: IConnection, elmWorkspaceFolder: URI) {
        this.connection = connection;
        this.elmWorkspaceFolder = elmWorkspaceFolder;
    }

    public execActivateAnalyseProcesses =
        async (param: DidSaveTextDocumentParams): Promise<PublishDiagnosticsParams[]> => {
            try {
                const processReady = await this.startAnalyseProcess();

                if (processReady) {
                    const analyseMessage = await this.initSocketClient();
                    const compilerErrors: IElmIssue[] = [];
                    analyseMessage.forEach((element) => {

                        compilerErrors.push(...this.parseMessage(this.elmWorkspaceFolder, element));
                    });
                    const splitCompilerErrors: Map<string, IElmIssue[]> = new Map();

                    compilerErrors.forEach((issue: IElmIssue) => {
                        // If provided path is relative, make it absolute
                        if (issue.file.startsWith(".")) {
                            issue.file = this.elmWorkspaceFolder + issue.file.slice(1);
                        }
                        if (splitCompilerErrors.has(issue.file)) {
                            splitCompilerErrors.get(issue.file).push(issue);
                        } else {
                            splitCompilerErrors.set(issue.file, [issue]);
                        }
                    });
                    const result: PublishDiagnosticsParams[] = [];
                    splitCompilerErrors.forEach((issue: IElmIssue[], issuePath: string) => {
                        result.push({
                            diagnostics: issue.map((error) => this.elmMakeIssueToDiagnostic(error)),
                            uri: URI.file(issuePath).toString(),
                        });
                    });
                    return result;
                }
            } catch (e) {
                this.connection.console.error("Running Elm-analyse command failed");
            }
        }

    // todo this is a duplicated for now
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
            null,
            "Elm",
        );
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

    private initSocketClient(): Promise<IElmAnalyseMessage[]> {
        return new Promise<IElmAnalyseMessage[]>((resolve, reject) => {
            try {
                const wsPath = "ws://localhost:6010/state";
                if (this.analyseSocket) {
                    this.analyseSocket.close();
                }
                this.analyseSocket = new WebSocket(wsPath);
                this.analyseSocket.on("message", (stateJson) => {
                    try {
                        const state = JSON.parse(stateJson.toString());
                        const messages: IElmAnalyseMessage[] = state.messages;
                        resolve(messages);
                    } catch (e) {
                        this.connection.window.showErrorMessage(
                            "Running websocket against Elm-analyse failed. " +
                            "Check if elm-analyse has been configured correctly.",
                        );
                        reject();
                    }
                });
                this.analyseSocket.on("error", (e) => {
                    this.connection.window.showErrorMessage(
                        "Running websocket against Elm-analyse failed." +
                        " Check if elm-analyse has been configured correctly.",
                    );
                    reject();
                });
            } catch (e) {
                this.connection.window.showErrorMessage(
                    "Running websocket against Elm-analyse failed. " +
                    "If set to external - check if elm-analyse has been started in separate console.",
                );
                reject();
            }
        });
    }

    private parseMessage(
        cwd: URI,
        message: IElmAnalyseMessage,
    ): IElmIssue[] {
        const elmAnalyseIssues: IElmIssue[] = [];
        const messageInfoFileRegions = this.parseMessageInfoFileRanges(
            message.data,
        ).map(this.convertRangeToRegion);
        messageInfoFileRegions.forEach((messageInfoFileRegion) => {
            const issue: IElmIssue = {
                details: message.data.description,
                file: path.join(cwd.path, message.file),
                overview: message.type,
                region: messageInfoFileRegion,
                subregion: "",
                tag: "analyser",
                type: "warning",
            };
            elmAnalyseIssues.push(issue);
        });

        return elmAnalyseIssues;
    }

    private parseMessageInfoFileRanges(messageInfoData: IElmAnalyseMessageData) {
        let messageInfoFileRanges: number[][];
        const messageInfoProperties = messageInfoData.properties as any;
        if (messageInfoProperties.hasOwnProperty("range")) {
            messageInfoFileRanges = [messageInfoProperties.range];
        } else if (
            messageInfoProperties.hasOwnProperty("range1") &&
            messageInfoProperties.hasOwnProperty("range2")
        ) {
            messageInfoFileRanges = [
                messageInfoProperties.range1,
                messageInfoProperties.range2,
            ];
        } else if (messageInfoProperties.hasOwnProperty("ranges")) {
            messageInfoFileRanges = messageInfoProperties.ranges;
        } else {
            messageInfoFileRanges = [[0, 0, 0, 0]];
        }
        return messageInfoFileRanges;
    }

    private convertRangeToRegion(range: number[]): IElmIssueRegion {
        return {
            end: {
                column: range[3],
                line: range[2],
            },
            start: {
                column: range[1],
                line: range[0],
            },
        };
    }

    private async startAnalyseProcess(
    ) {
        const state = await checkElmAnalyseServerState();
        if (state === ElmAnalyseServerState.Running) {
            return true;
        } else if (state === ElmAnalyseServerState.PortInUse) {
            this.connection.window.showErrorMessage(`Port already in use by another process. Please stop the running
 process or select another port for elm-analyse.`);
            return false;
        } else {
            this.analyse = execCmd("elm-analyse", {
                cmdArguments: ["-s", "-p", "6010"],
                notFoundText: "Install Elm-analyse using npm i elm-analyse -g",
                showMessageOnError: true,

                onStart: () => this.analyse.stdin.write.bind(this.analyse.stdin),
            },
                this.elmWorkspaceFolder,
                this.connection,
            );
            return true;
        }
    }
}

function checkElmAnalyseServerState(
): Thenable<ElmAnalyseServerState> {
    const result = getElmAnalyseServerInfo("http://localhost:6010").then(
        (info) => {
            if (info.match(/Elm Analyse/)) {
                return ElmAnalyseServerState.Running;
            } else {
                return ElmAnalyseServerState.PortInUse;
            }
        },
        (err) => {
            return ElmAnalyseServerState.NotRunning;
        },
    );
    return result;
}

function getElmAnalyseServerInfo(url: string): Thenable<any> {
    const titleRegex = /(<\s*title[^>]*>(.+?)<\s*\/\s*title)>/gi;
    return new Promise((resolve, reject) => {
        request(url, (err, _, body) => {
            if (err) {
                reject(err);
            } else {
                let info = "";
                try {
                    const match = titleRegex.exec(body);
                    if (match && match[2]) {
                        this.connection.console.log(match[2]);
                        info = match[2];
                    }
                } catch (e) {
                    reject(e);
                }
                resolve(info);
            }
        });
    });
}
