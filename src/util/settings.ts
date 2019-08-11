import { ClientCapabilities, IConnection } from "vscode-languageserver";

export interface IClientSettings {
  elmFormatPath: string;
  elmPath: string;
  elmTestPath: string;
  trace: { server: string };
}

export class Settings {
  private fallbackClientSettings: IClientSettings = {
    elmFormatPath: "elm-format",
    elmPath: "elm",
    elmTestPath: "elm-test",
    trace: { server: "off" },
  };

  private clientSettings: IClientSettings = {
    elmFormatPath: "elm-format",
    elmPath: "elm",
    elmTestPath: "elm-test",
    trace: { server: "off" },
  };

  public get getClientSettings(): IClientSettings {
    return this.clientSettings;
  }

  public updateSettings(config: any): void {
    this.clientSettings = Object.assign({
      ...this.fallbackClientSettings,
      ...config,
    });
  }
}
