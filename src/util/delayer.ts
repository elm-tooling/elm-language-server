/**
 * Delayer taken from VS Code typescript-language-features: https://github.com/microsoft/vscode/blob/a36c68b9ec3d6a0aca9799d7a10be741a6658a51/extensions/typescript-language-features/src/utils/async.ts#L10
 */

export interface ITask<T> {
  (): T;
}

export class Delayer<T> {
  public defaultDelay: number;
  private timeout: NodeJS.Timeout | null; // Timer
  private completionPromise: Promise<T | null> | null;
  private onSuccess: ((value: T | PromiseLike<T> | undefined) => void) | null;
  private task: ITask<T> | null;

  constructor(defaultDelay: number) {
    this.defaultDelay = defaultDelay;
    this.timeout = null;
    this.completionPromise = null;
    this.onSuccess = null;
    this.task = null;
  }

  public trigger(
    task: ITask<T>,
    delay: number = this.defaultDelay,
  ): Promise<T | null> {
    this.task = task;
    if (delay >= 0) {
      this.cancelTimeout();
    }

    if (!this.completionPromise) {
      this.completionPromise = new Promise<T | undefined>((resolve) => {
        this.onSuccess = resolve;
      }).then(() => {
        this.completionPromise = null;
        this.onSuccess = null;
        const result = this.task && this.task();
        this.task = null;
        return result;
      });
    }

    if (delay >= 0 || this.timeout === null) {
      this.timeout = setTimeout(
        () => {
          this.timeout = null;
          if (this.onSuccess) {
            this.onSuccess(undefined);
          }
        },
        delay >= 0 ? delay : this.defaultDelay,
      );
    }

    return this.completionPromise;
  }

  private cancelTimeout(): void {
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}
