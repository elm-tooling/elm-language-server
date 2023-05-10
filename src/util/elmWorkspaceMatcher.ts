import { container } from "tsyringe";
import { CancellationToken } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { IProgram } from "../compiler/program";
import { ISourceFile } from "../compiler/forest";
import { NoWorkspaceContainsError } from "./noWorkspaceContainsError";

export interface IParams {
  program: IProgram;
  sourceFile: ISourceFile;
}

/**
 * Identifies the relevant ElmWorkspace for a given ParamType, either directly
 * (getElmWorkspaceFor) or when an event handler receives a ParamType
 * (handle) it returns a params object with a combined type ParamType and IParams
 * which has the program and sourceFile.
 */
export class ElmWorkspaceMatcher<ParamType> {
  private elmWorkspaces: IProgram[];

  constructor(private getUriFor: (param: ParamType) => URI) {
    this.elmWorkspaces = container.resolve("ElmWorkspaces");
  }

  public handle<ResultType>(
    handler: (
      param: ParamType & IParams,
      token?: CancellationToken,
    ) => ResultType | Promise<ResultType>,
  ): (param: ParamType, token?: CancellationToken) => Promise<ResultType> {
    return async (
      param: ParamType,
      token?: CancellationToken,
    ): Promise<ResultType> => {
      await this.waitForInitialization();
      const program = this.getProgramFor(param);

      return handler(
        {
          ...param,
          program,
          sourceFile: this.getSourceFileFor(param, program),
        },
        token,
      );
    };
  }

  public handleResolve<ResultType>(
    handler: (
      param: ParamType,
      program: IProgram,
      sourceFile: ISourceFile,
      token?: CancellationToken,
    ) => ResultType | Promise<ResultType>,
  ): (param: ParamType, token?: CancellationToken) => Promise<ResultType> {
    return async (
      param: ParamType,
      token?: CancellationToken,
    ): Promise<ResultType> => {
      await this.waitForInitialization();
      const program = this.getProgramFor(param);

      return handler(
        param,
        program,
        this.getSourceFileFor(param, program),
        token,
      );
    };
  }

  public getProgramFor(param: ParamType): IProgram {
    const uri = this.getUriFor(param);
    const program =
      // first look for a program where the file has been parsed to a tree
      this.elmWorkspaces.find((ws) => ws.hasDocument(uri)) ||
      // fallback: find a program where the file is in the source-directories
      this.elmWorkspaces.find((ws) => ws.isInSourceDirectory(uri.toString()));

    if (!program) {
      throw new NoWorkspaceContainsError(this.getUriFor(param));
    }

    return program;
  }

  public getSourceFileFor(param: ParamType, program: IProgram): ISourceFile {
    const uri = this.getUriFor(param).toString();

    return program.getForest().getByUri(uri)!;
  }

  private async waitForInitialization(): Promise<void> {
    const uninitialized = this.elmWorkspaces.filter((ws) => !ws.isInitialized);

    if (uninitialized.length === 0) {
      return Promise.resolve();
    }

    // Ensure that the programs are initialized
    // We really should only need to wait until the root projects source directories are loaded, not the entire program
    // Ideally we would not have to initialize everything up front and the program could load lazliy
    // The problem is most of the program API is synchronous, but our readFile (what we to initialize) is async
    // Either we need to make the program API async or we need to make the readFile sync
    // A readFile sync would return an empty string if we need to load the file asychronously (not from a real file system), then we the file is loaded a change would be triggered with the actual contents
    // On the other hand, an async program API might work, but it is a lot to refactor and I'm not sure of the performance implications
    await Promise.all(uninitialized.map((ws) => ws.init()));
  }
}
