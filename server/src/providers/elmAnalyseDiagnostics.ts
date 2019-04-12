import * as path from "path";
import { IConnection } from "vscode-languageserver";
import URI from "vscode-uri";
import { execCmd } from "../util/elmUtils";
import { IElmIssue, IElmIssueRegion } from "./diagnosticsProvider";

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

  constructor(connection: IConnection, elmWorkspaceFolder: URI) {
    this.connection = connection;
    this.elmWorkspaceFolder = elmWorkspaceFolder;
  }

  public execActivateAnalyseProcesses = async (
    filePath: URI,
  ): Promise<IElmIssue[]> => {
    const compilerErrors: IElmIssue[] = [];
    try {
      const analyseMessage = await this.startAnalyseProcess();

      analyseMessage.forEach(element => {
        compilerErrors.push(
          ...this.parseMessage(this.elmWorkspaceFolder, element),
        );
      });
    } catch (e) {
      this.connection.console.error("Running Elm-analyse command failed");
    }
    return compilerErrors;
  };

  private parseMessage(cwd: URI, message: IElmAnalyseMessage): IElmIssue[] {
    const elmAnalyseIssues: IElmIssue[] = [];
    const messageInfoFileRegions = this.parseMessageInfoFileRanges(
      message.data,
    ).map(this.convertRangeToRegion);
    messageInfoFileRegions.forEach(messageInfoFileRegion => {
      const issue: IElmIssue = {
        details: message.data.description,
        file: path.join(cwd.toString(true), message.file),
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

  private async startAnalyseProcess() {
    return new Promise<IElmAnalyseMessage[]>((resolve, reject) => {
      return execCmd(
        "elm-analyse",
        {
          cmdArguments: ["--format=json"],
          notFoundText: "Install Elm-analyse using npm i elm-analyse -g",
          showMessageOnError: true,

          onStdout: data => {
            const state = JSON.parse(data.toString());
            const messages: IElmAnalyseMessage[] = state.messages;
            resolve(messages);
          },
        },
        this.elmWorkspaceFolder,
        this.connection,
      );
    });
  }
}
