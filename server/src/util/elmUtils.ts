import * as cp from "child_process";
import { IConnection } from "vscode-languageserver";
import URI from "vscode-uri";

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
    kill();
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
    const {
        onStart,
        onStdout,
        onStderr,
        onExit,
    } = options;
    let childProcess;
    let firstResponse = true;
    let wasKilledbyUs = false;

    const IexecutingCmd: any = new Promise((resolve, reject) => {
        const cmdArguments = options ? options.cmdArguments : [];

        const fullCommand = cmd + " " + (cmdArguments || []).join(" ");
        childProcess = cp.exec(fullCommand, { cwd: elmRootPath.fsPath }, handleExit);

        childProcess.stdout.on("data", (data: Buffer) => {
            if (firstResponse && onStart) {
                onStart();
            }
            firstResponse = false;
            if (onStdout) {
                onStdout(data.toString());
            }
        });

        childProcess.stderr.on("data", (data: Buffer) => {
            if (firstResponse && onStart) {
                onStart();
            }
            firstResponse = false;
            if (onStderr) {
                onStderr(data.toString());
            }
        });

        function handleExit(err: Error, stdout: string, stderr: string) {
            IexecutingCmd.isRunning = false;
            if (onExit) {
                onExit();
            }
            if (!wasKilledbyUs) {
                if (err) {
                    if (options.showMessageOnError) {
                        const cmdName = cmd.split(" ", 1)[0];
                        const cmdWasNotFound =
                            // Windows method apparently still works on non-English systems
                            (isWindows &&
                                err.message.includes(`'${cmdName}' is not recognized`)) ||
                            (!isWindows && (err as any).code === 127);

                        if (cmdWasNotFound) {
                            const notFoundText = options ? options.notFoundText : "";
                            connection.window.showErrorMessage(
                                `${cmdName} is not available in your path. ` + notFoundText,
                            );
                        } else {
                            connection.window.showErrorMessage(err.message);
                        }
                    } else {
                        reject(err);
                    }
                } else {
                    resolve({ stdout, stderr });
                }
            }
        }
    });
    IexecutingCmd.stdin = childProcess.stdin;
    IexecutingCmd.kill = killProcess;
    IexecutingCmd.isRunning = true;

    return IexecutingCmd as IExecutingCmd;

    function killProcess() {
        wasKilledbyUs = true;
        if (isWindows) {
            cp.spawn("taskkill", ["/pid", childProcess.pid.toString(), "/f", "/t"]);
        } else {
            childProcess.kill("SIGINT");
        }
    }
}
