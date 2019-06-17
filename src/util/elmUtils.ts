import * as cp from "child_process";
import * as path from "path";
import { IConnection, SymbolKind } from "vscode-languageserver";
import { URI } from "vscode-uri";

export const isWindows = process.platform === "win32";

/** Options for execCmd */
export interface IExecCmdOptions {
  /** Any arguments */
  cmdArguments?: string[];
  /** Shows a message if an error occurs (in particular the command not being */
  /* found), instead of rejecting. If this happens, the promise never resolves */
  showMessageOnError?: boolean;
  /** Called after the process successfully starts */
  onStart?: () => void;
  /** Called when data is sent to stdout */
  onStdout?: (data: string) => void;
  /** Called when data is sent to stderr */
  onStderr?: (data: string) => void;
  /** Called after the command (successfully or unsuccessfully) exits */
  onExit?: () => void;
  /** Text to add when command is not found (maybe helping how to install) */
  notFoundText?: string;
}

/** Type returned from execCmd. Is a promise for when the command completes
 *  and also a wrapper to access ChildProcess-like methods.
 */
export interface IExecutingCmd
  extends Promise<{ stdout: string; stderr: string }> {
  /** The process's stdin */
  stdin: NodeJS.WritableStream;
  /** End the process */
  kill(): void;
  /** Is the process running */
  isRunning: boolean; // tslint:disable-line
}

/** Executes a command. Shows an error message if the command isn't found */
export function execCmd(
  cmd: string,
  options: IExecCmdOptions = {},
  elmRootPath: URI,
  connection: IConnection,
): IExecutingCmd {
  const { onStart, onStdout, onStderr, onExit } = options;
  let childProcess: cp.ChildProcess;
  let firstResponse = true;
  let wasKilledByUs = false;

  const executingCmd: any = new Promise((resolve, reject) => {
    const cmdArguments = options ? options.cmdArguments : [];

    const fullCommand = cmd + " " + (cmdArguments || []).join(" ");
    childProcess = cp.exec(
      fullCommand,
      { cwd: elmRootPath.fsPath },
      handleExit,
    );

    if (!childProcess.stdout) {
      return;
    }

    childProcess.stdout.on("data", (data: Buffer) => {
      if (firstResponse && onStart) {
        onStart();
      }
      firstResponse = false;
      if (onStdout) {
        onStdout(data.toString());
      }
    });

    if (!childProcess.stderr) {
      return;
    }
    childProcess.stderr.on("data", (data: Buffer) => {
      if (firstResponse && onStart) {
        onStart();
      }
      firstResponse = false;
      if (onStderr) {
        onStderr(data.toString());
      }
    });

    function handleExit(
      error: cp.ExecException | null,
      stdout: string | Buffer,
      stderr: string | Buffer,
    ) {
      executingCmd.isRunning = false;
      if (onExit) {
        onExit();
      }
      if (!wasKilledByUs) {
        if (error) {
          if (options.showMessageOnError) {
            const cmdName = cmd.split(" ", 1)[0];
            const cmdWasNotFound =
              // Windows method apparently still works on non-English systems
              (isWindows &&
                error.message.includes(`'${cmdName}' is not recognized`)) ||
              (!isWindows && (error as any).code === 127);

            if (cmdWasNotFound) {
              const notFoundText = options ? options.notFoundText : "";
              connection.window.showErrorMessage(
                `${cmdName} is not available in your path. ` + notFoundText,
              );
            } else {
              connection.window.showErrorMessage(error.message);
            }
          } else {
            reject(error);
          }
        } else {
          resolve({ stdout, stderr });
        }
      }
    }
  });
  // @ts-ignore
  executingCmd.stdin = childProcess.stdin;
  executingCmd.kill = killProcess;
  executingCmd.isRunning = true;

  return executingCmd as IExecutingCmd;

  function killProcess() {
    wasKilledByUs = true;
    if (isWindows) {
      cp.spawn("taskkill", ["/pid", childProcess.pid.toString(), "/f", "/t"]);
    } else {
      childProcess.kill("SIGINT");
    }
  }
}

export function isTestFile(filename: string, rootPath: string): boolean {
  const testFolder = path.join(rootPath, "tests");
  if (filename.startsWith(testFolder)) {
    return true;
  }
  return false;
}

// Special type that has no core mock https://github.com/elm/compiler/blob/51e20357137ebc9c3f6136cf0a3fe21c24027f39/compiler/src/Canonicalize/Environment/Foreign.hs#L62
export function getEmptyTypes() {
  return [
    {
      markdown: `An \`List\` is a list of items. Every item must be of the same type. Valid syntax for lists includes:

    []
    [42, 43]
    ["one", "two", "three"]
    [3.14, 0.1234]
    ['a', 'Z', '0']

    `,
      name: "List",
      symbolKind: SymbolKind.Enum,
    },
  ];
}
