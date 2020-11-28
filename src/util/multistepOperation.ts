import { CancellationToken, Connection } from "vscode-languageserver";
import { OperationCanceledException } from "../cancellation";

/**
 * MultistepOperation taken from Typescript: https://github.com/microsoft/TypeScript/blob/79ffd03f8b73010fa03cef624e5f1770bc9c975b/src/server/session.ts#L166
 */

interface INextStep {
  immediate(action: () => void): void;
  delay(ms: number, action: () => void): void;
  promise(action: () => Promise<void>): void;
}

export class MultistepOperation implements INextStep {
  private timerHandle: NodeJS.Timeout | undefined;
  private immediateId: NodeJS.Immediate | undefined;
  private savedPromise: Promise<void> | undefined;
  private cancellationToken: CancellationToken | undefined;
  private done: (() => void) | undefined;

  constructor(private connection: Connection) {}

  public startNew(
    cancellationToken: CancellationToken,
    action: (next: INextStep) => void,
    done: () => void,
  ): void {
    this.complete();
    this.cancellationToken = cancellationToken;
    this.done = done;
    this.executeAction(action);
  }

  private complete(): void {
    if (this.done !== undefined) {
      this.done();
      this.done = undefined;
    }

    this.cancellationToken = undefined;
    this.setTimerHandle(undefined);
    this.setImmediateId(undefined);
    this.savedPromise = undefined;
  }

  public immediate(action: () => void): void {
    this.setImmediateId(
      setImmediate(() => {
        this.immediateId = undefined;
        this.executeAction(action);
      }),
    );
  }

  public delay(ms: number, action: () => void): void {
    this.setTimerHandle(
      setTimeout(() => {
        this.timerHandle = undefined;
        this.executeAction(action);
      }, ms),
    );
  }

  public promise(action: () => Promise<void>): void {
    if (this.cancellationToken?.isCancellationRequested) {
      this.complete();
    } else {
      this.savedPromise = action()
        .then(() => {
          if (!this.hasPendingWork()) {
            this.complete();
          }
        })
        .catch(() => {
          this.complete();
        })
        .finally(() => {
          this.savedPromise = undefined;
        });
    }
  }

  private executeAction(action: (next: INextStep) => void): void {
    let stop = false;
    try {
      if (this.cancellationToken?.isCancellationRequested) {
        stop = true;
      } else {
        action(this);
      }
    } catch (e) {
      // ignore cancellation request
      if (!(e instanceof OperationCanceledException)) {
        this.connection.console.error(`${e} delayed processing of request`);
      }

      stop = true;
    }

    if (stop || !this.hasPendingWork()) {
      this.complete();
    }
  }

  private setTimerHandle(timerHandle: NodeJS.Timeout | undefined): void {
    if (this.timerHandle !== undefined) {
      clearTimeout(this.timerHandle);
    }
    this.timerHandle = timerHandle;
  }

  private setImmediateId(immediateId: NodeJS.Immediate | undefined): void {
    if (this.immediateId !== undefined) {
      clearImmediate(this.immediateId);
    }
    this.immediateId = immediateId;
  }

  private hasPendingWork(): boolean {
    return !!this.timerHandle || !!this.immediateId || !!this.savedPromise;
  }
}
