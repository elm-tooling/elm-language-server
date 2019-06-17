import { ClientCapabilities, IConnection } from "vscode-languageserver";

export interface IClientSettings {
  elmFormatPath: string;
  elmPath: string;
  elmTestPath: string;
  diagnosticsOn: "change" | "save";
}

export class Settings {
  private fallbackClientSettings: IClientSettings = {
    diagnosticsOn: "change",
    elmFormatPath: "elm-format",
    elmPath: "elm",
    elmTestPath: "elm-test",
  };

  constructor(
    private capabilities: ClientCapabilities,
    private initializationOptions: IClientSettings,
  ) {}

  public getSettings(connection: IConnection): Thenable<IClientSettings> {
    const supportsConfig =
      this.capabilities &&
      this.capabilities.workspace &&
      this.capabilities.workspace.configuration;

    const defaultSettings = {
      ...this.fallbackClientSettings,
      ...this.initializationOptions,
    };

    if (!supportsConfig) {
      return Promise.resolve(defaultSettings);
    }

    return (
      connection.workspace
        .getConfiguration({ section: "elmLS" })
        // Allow falling back to the preset params if we cant get the
        // settings from the workspace
        .then(settings => Object.assign({ ...defaultSettings, ...settings }))
    );
  }
}
