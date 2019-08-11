import { ClientCapabilities, IConnection } from "vscode-languageserver";

export interface IClientSettings {
  diagnosticsOnSaveOnly: boolean;
  elmFormatPath: string;
  elmPath: string;
  elmTestPath: string;
  trace: { server: string };
}

export class Settings {
  private fallbackClientSettings: IClientSettings = {
    diagnosticsOnSaveOnly: false,
    elmFormatPath: "elm-format",
    elmPath: "elm",
    elmTestPath: "elm-test",
    trace: { server: "off" },
  };

  private clientSettings: IClientSettings = {
    diagnosticsOnSaveOnly: false,
    elmFormatPath: "elm-format",
    elmPath: "elm",
    elmTestPath: "elm-test",
    trace: { server: "off" },
  };

  constructor(private connection: IConnection) {}

  public get getStartupClientSettings(): IClientSettings {
    return this.clientSettings;
  }

  public async getClientSettings(): Promise<IClientSettings> {
    this.updateSettings(
      await this.connection.workspace.getConfiguration("elmLS"),
    );
    return Promise.resolve(this.clientSettings);
  }

  public updateSettings(config: any): void {
    this.clientSettings = Object.assign({
      ...this.fallbackClientSettings,
      ...config,
    });
  }
}
