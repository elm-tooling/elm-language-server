import { CancellationToken } from "vscode-languageserver";

export class OperationCanceledException {}

export interface ICancellationToken {
  isCancellationRequested(): boolean;

  /** @throws OperationCanceledException if isCancellationRequested is true */
  throwIfCancellationRequested(): void;
}

export class ServerCancellationToken implements ICancellationToken {
  constructor(private cancellationToken: CancellationToken) {}

  public isCancellationRequested(): boolean {
    return this.cancellationToken.isCancellationRequested;
  }

  public throwIfCancellationRequested(): void {
    if (this.isCancellationRequested()) {
      throw new OperationCanceledException();
    }
  }
}

/**
 * ThrottledCancellationToken taken from Typescript: https://github.com/microsoft/TypeScript/blob/79ffd03f8b73010fa03cef624e5f1770bc9c975b/src/services/services.ts#L1152
 */
export class ThrottledCancellationToken implements ICancellationToken {
  // Store when we last tried to cancel.  Checking cancellation can be expensive (as we have
  // to marshall over to the host layer).  So we only bother actually checking once enough
  // time has passed.
  private lastCancellationCheckTime = 0;

  constructor(
    private cancellationToken: CancellationToken,
    private readonly throttleWaitMilliseconds = 20,
  ) {}

  public isCancellationRequested(): boolean {
    const time = performance.now();
    const duration = Math.abs(time - this.lastCancellationCheckTime);
    if (duration >= this.throttleWaitMilliseconds) {
      // Check no more than once every throttle wait milliseconds
      this.lastCancellationCheckTime = time;

      try {
        return this.cancellationToken.isCancellationRequested;
      } catch {
        //
      }
    }

    return false;
  }

  public throwIfCancellationRequested(): void {
    if (this.isCancellationRequested()) {
      throw new OperationCanceledException();
    }
  }
}
