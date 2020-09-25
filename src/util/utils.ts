export class Utils {
  public static notUndefined<T>(x: T | undefined): x is T {
    return x !== undefined;
  }

  public static notUndefinedOrNull<T>(x: T | undefined | null): x is T {
    return x !== undefined && x !== null;
  }
}
