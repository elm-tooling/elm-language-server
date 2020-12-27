import { container } from "tsyringe";
import { CancellationToken } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { IProgram } from "../program";
import { ISourceFile } from "../forest";
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
    ) => ResultType,
  ): (param: ParamType, token?: CancellationToken) => ResultType {
    return (param: ParamType, token?: CancellationToken): ResultType => {
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
    ) => ResultType,
  ): (param: ParamType, token?: CancellationToken) => ResultType {
    return (param: ParamType, token?: CancellationToken): ResultType => {
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
      this.elmWorkspaces.find((ws) => ws.isInSourceDirectory(uri.fsPath));

    if (!program) {
      throw new NoWorkspaceContainsError(this.getUriFor(param));
    }

    return program;
  }

  public getSourceFileFor(param: ParamType, program: IProgram): ISourceFile {
    const uri = this.getUriFor(param).toString();

    return program.getForest().getByUri(uri)!;
  }
}
