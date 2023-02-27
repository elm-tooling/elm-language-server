import { Connection } from "vscode-languageserver";

export class CommandManager {
  public static commands: string[] = [];
  private static handlers = new Map<
    string,
    (...args: string[]) => void | Promise<void>
  >();

  public static register(
    command: string,
    handler: (...args: string[]) => void | Promise<void>,
  ): void {
    this.commands.push(command);
    this.handlers.set(command, handler);
  }

  /**
   * Initialize all command handlers for the connection
   */
  public static initHandlers(connection: Connection): void {
    connection.onExecuteCommand((params) => {
      const handler = this.handlers.get(params.command);

      if (handler) {
        if (params.arguments) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          void handler(...params.arguments);
        } else {
          void handler();
        }
      }
    });
  }
}
