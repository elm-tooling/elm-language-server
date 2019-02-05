import * as path from "path";
import request = require("request");
import { IConnection } from "vscode-languageserver";
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
        async (filePath: URI): Promise<IElmIssue[]> => {
            try {
                const processReady = await this.startAnalyseProcess();

                if (processReady) {
                    const analyseMessage = await this.initSocketClient();
                    const compilerErrors: IElmIssue[] = [];
                    analyseMessage.forEach((element) => {

                        compilerErrors.push(...this.parseMessage(this.elmWorkspaceFolder, element));
                    });
                    return compilerErrors;
                }
            } catch (e) {
                this.connection.console.error("Running Elm-analyse command failed");
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
                file: path.join(cwd.fsPath, message.file),
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
        (info: string) => {
            if (info.startsWith("Elm Analyse")) {
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
    const titleRegex = /(<title\>(.+?)<\/title)\>/gi;
    return new Promise((resolve, reject) => {
        request(url, (err, _, body) => {
            if (err) {
                reject(err);
            } else {
                try {
                    let info = "";
                    const match = titleRegex.exec(body);
                    if (match && match[2]) {
                        info = match[2];
                        resolve(info);
                    }
                } catch (e) {
                    reject(e);
                }
            }
        });
    });
}
