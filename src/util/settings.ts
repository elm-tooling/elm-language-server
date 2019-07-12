import { ClientCapabilities, IConnection } from "vscode-languageserver";

export interface IClientSettings {
  elmFormatPath: string;
  elmPath: string;
  elmTestPath: string;
}

export class Settings {
  private fallbackClientSettings: IClientSettings = {
    elmFormatPath: "elm-format",
    elmPath: "elm",
    elmTestPath: "elm-test",
  };

  constructor(
    private capabilities: ClientCapabilities,
    private initializationOptions: IClientSettings,
  ) {}

  public getSettings(connection: IConnection): Promise<IClientSettings> {
    // Allow falling back to the preset params
    const defaultSettings = {
      ...this.fallbackClientSettings,
      ...this.initializationOptions,
    };

    const supportsConfig =
      this.capabilities &&
      this.capabilities.workspace &&
      this.capabilities.workspace.configuration;

    if (!supportsConfig) {
      return Promise.resolve(defaultSettings);
    }

    return Promise.resolve(
      connection.workspace
        .getConfiguration({ section: "elmLS" })
        .then(settings => Object.assign({ ...defaultSettings, ...settings })),
    );
  }
}
