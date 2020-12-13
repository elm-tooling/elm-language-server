import { URI } from "vscode-uri";
import { IPossibleImport } from "./importUtils";

export interface IPossibleImportsCache {
  get(uri: URI): IPossibleImport[] | undefined;
  set(uri: URI, possibleImports: IPossibleImport[]): void;
  clear(): void;
}

export class PossibleImportsCache implements IPossibleImportsCache {
  private uri: URI | undefined;
  private possibleImports: IPossibleImport[] | undefined;

  public get(uri: URI): IPossibleImport[] | undefined {
    if (uri === this.uri) {
      return this.possibleImports;
    }
  }

  public set(uri: URI, possibleImports: IPossibleImport[]): void {
    this.uri = uri;
    this.possibleImports = possibleImports;
  }

  public clear(): void {
    this.uri = undefined;
    this.possibleImports = undefined;
  }
}
