export class Utils {
  public static notUndefined<T>(x: T | undefined): x is T {
    return x !== undefined;
  }
}
