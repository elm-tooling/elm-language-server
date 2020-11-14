import { IPossibleImport } from "./importUtils";

export interface IPossibleImportsCache {
  get(uri: string): IPossibleImport[] | undefined;
  set(uri: string, possibleImports: IPossibleImport[]): void;
  clear(): void;
}

export class PossibleImportsCache implements IPossibleImportsCache {
  private uri: string | undefined;
  private possibleImports: IPossibleImport[] | undefined;

  public get(uri: string): IPossibleImport[] | undefined {
    if (uri === this.uri) {
      return this.possibleImports;
    }
  }

  public set(uri: string, possibleImports: IPossibleImport[]): void {
    this.uri = uri;
    this.possibleImports = possibleImports;
  }

  public clear(): void {
    this.uri = undefined;
    this.possibleImports = undefined;
  }
}
