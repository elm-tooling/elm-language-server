import { container } from "tsyringe";
import { CancellationToken } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { IElmWorkspace } from "../elmWorkspace";
import { ITreeContainer } from "../forest";
import { NoWorkspaceContainsError } from "./noWorkspaceContainsError";

export interface IParams {
  program: IElmWorkspace;
  sourceFile: ITreeContainer;
}

/**
 * Identifies the relevant ElmWorkspace for a given ParamType, either directly
 * (getElmWorkspaceFor) or when an event handler receives a ParamType
 * (handle) it returns a params object with a combined type ParamType and IParams
 * which has the program and sourceFile.
 */
export class ElmWorkspaceMatcher<ParamType> {
  private elmWorkspaces: IElmWorkspace[];

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
      program: IElmWorkspace,
      sourceFile: ITreeContainer,
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

  /**
   * @deprecated Use handle() instead, which returns a params with the program and source file in it
   */
  public handlerForWorkspace<ResultType>(
    handler: (
      param: ParamType,
      program: IElmWorkspace,
      token?: CancellationToken,
    ) => ResultType,
  ): (param: ParamType, token?: CancellationToken) => ResultType {
    return (param: ParamType, token?: CancellationToken): ResultType => {
      return handler(param, this.getProgramFor(param), token);
    };
  }

  public getProgramFor(param: ParamType): IElmWorkspace {
    const uri = this.getUriFor(param);
    const workspace =
      // first look for a workspace where the file has been parsed to a tree
      this.elmWorkspaces.find((ws) => ws.hasDocument(uri)) ||
      // fallback: find a workspace where the file is in the source-directories
      this.elmWorkspaces.find((ws) => ws.isInSourceDirectory(uri.fsPath));

    if (!workspace) {
      throw new NoWorkspaceContainsError(this.getUriFor(param));
    }

    return workspace;
  }

  public getSourceFileFor(
    param: ParamType,
    program: IElmWorkspace,
  ): ITreeContainer {
    const uri = this.getUriFor(param).toString();

    return program.getForest().getByUri(uri)!;
  }
}
