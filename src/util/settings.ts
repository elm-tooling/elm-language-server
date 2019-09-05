import { ClientCapabilities, IConnection } from "vscode-languageserver";

export interface IClientSettings {
  elmFormatPath: string;
  elmPath: string;
  elmTestPath: string;
  elmAnalyseTrigger: ElmAnalyseTrigger;
  trace: { server: string };
}

export type ElmAnalyseTrigger = "change" | "save" | "never";

export class Settings {
  private clientSettings: IClientSettings = {
    elmAnalyseTrigger: "change",
    elmFormatPath: "",
    elmPath: "",
    elmTestPath: "",
    trace: { server: "off" },
  };

  private initDone = false;

  constructor(
    private connection: IConnection,
    config: any,
    private clientCapabilities: ClientCapabilities,
  ) {
    this.updateSettings(config);
  }

  public initFinished() {
    this.initDone = true;
  }

  public async getClientSettings(): Promise<IClientSettings> {
    if (
      this.initDone &&
      this.clientCapabilities.workspace &&
      this.clientCapabilities.workspace.configuration
    ) {
      this.updateSettings(
        await this.connection.workspace.getConfiguration("elmLS"),
      );
    }
    return this.clientSettings;
  }

  private updateSettings(config: any): void {
    this.clientSettings = { ...this.clientSettings, ...config };
  }
}
