import {
  CancellationToken,
  CancellationTokenSource,
} from "vscode-languageserver";
import { URI } from "vscode-uri";

export class DiagnosticsRequest {
  public static execute(
    requestor: (
      files: URI[],
      delay: number,
      cancellationToken: CancellationToken,
    ) => Promise<void>,
    files: URI[],
    onDone: () => void,
  ): DiagnosticsRequest {
    return new DiagnosticsRequest(requestor, files, onDone);
  }

  private done = false;
  private readonly token: CancellationTokenSource = new CancellationTokenSource();

  private constructor(
    requestor: (
      files: URI[],
      delay: number,
      cancellationToken: CancellationToken,
    ) => Promise<void>,
    public readonly files: URI[],
    onDone: () => void,
  ) {
    if (!files.length) {
      this.done = true;
      onDone();
    } else {
      requestor(files, 0, this.token.token).finally(() => {
        if (this.done) {
          return;
        }
        this.done = true;
        onDone();
      });
    }
  }

  public cancel(): void {
    if (!this.done) {
      this.token.cancel();
    }

    this.token.dispose();
  }
}
