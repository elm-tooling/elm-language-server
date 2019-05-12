import { IConnection } from "vscode-languageserver";

export interface IClientSettings {
  elmPath: string;
  elmFormatPath: string;
}

export class Settings {
  public static getSettings(
    connection: IConnection,
  ): Thenable<IClientSettings> {
    const result = connection.workspace.getConfiguration({
      section: "elmLS",
    });
    return result;
  }
}
