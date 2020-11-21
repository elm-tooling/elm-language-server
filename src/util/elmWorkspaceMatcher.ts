import { container } from "tsyringe";
import { CancellationToken } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { IElmWorkspace } from "../elmWorkspace";
import { NoWorkspaceContainsError } from "./noWorkspaceContainsError";

/**
 * Identifies the relevant ElmWorkspace for a given ParamType, either directly
 * (getElmWorkspaceFor) or when an event handler receives a ParamType
 * (handlerForWorkspace).
 */
export class ElmWorkspaceMatcher<ParamType> {
  private elmWorkspaces: IElmWorkspace[];

  constructor(private getUriFor: (param: ParamType) => URI) {
    this.elmWorkspaces = container.resolve("ElmWorkspaces");
  }

  public handlerForWorkspace<ResultType>(
    handler: (
      param: ParamType,
      elmWorkspace: IElmWorkspace,
      token?: CancellationToken,
    ) => ResultType,
  ): (param: ParamType, token?: CancellationToken) => ResultType {
    return (param: ParamType, token?: CancellationToken): ResultType => {
      return handler(param, this.getElmWorkspaceFor(param), token);
    };
  }

  public getElmWorkspaceFor(param: ParamType): IElmWorkspace {
    const uri = this.getUriFor(param);
    const workspace =
      // first look for a workspace where the file has been parsed to a tree
      this.elmWorkspaces.find((ws) => ws.hasDocument(uri)) ||
      // fallback: find a workspace where the file is in the source-directories
      this.elmWorkspaces.find((ws) => ws.hasPath(uri));

    if (!workspace) {
      throw new NoWorkspaceContainsError(this.getUriFor(param));
    }

    return workspace;
  }
}
