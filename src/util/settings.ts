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

  public getSettings(connection: IConnection): Thenable<IClientSettings> {
    const supportsConfig =
      this.capabilities &&
      this.capabilities.workspace &&
      this.capabilities.workspace.configuration;

    if (!supportsConfig) {
      return Promise.resolve(this.initializationOptions);
    }

    return connection.workspace
      .getConfiguration({
        section: "elmLS",
      })
      .then(settings =>
        // Allow falling back to the preset params if we cant get the
        // settings from the workspace
        Object.assign(
          {},
          this.fallbackClientSettings,
          this.initializationOptions,
          settings,
        ),
      );
  }
}
