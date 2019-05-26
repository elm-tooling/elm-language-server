import { ClientCapabilities, IConnection } from "vscode-languageserver";

export interface IClientSettings {
  elmPath: string;
  elmFormatPath: string;
}

export class Settings {
  private fallbackSettings: IClientSettings;
  private capabilities: ClientCapabilities;
  constructor(
    capabilities: ClientCapabilities,
    fallbackSettings: IClientSettings,
  ) {
    this.capabilities = capabilities;
    this.fallbackSettings = fallbackSettings;
  }

  public getSettings(connection: IConnection): Thenable<IClientSettings> {
    const supportsConfig =
      this.capabilities &&
      this.capabilities.workspace &&
      this.capabilities.workspace.configuration;

    if (!supportsConfig) {
      return Promise.resolve(this.fallbackSettings);
    }

    return connection.workspace
      .getConfiguration({
        section: "elmLS",
      })
      .then(settings =>
        // Allow falling back to the preset params if we cant get the
        // settings from the workspace
        Object.assign({}, this.fallbackSettings, settings),
      );
  }
}
