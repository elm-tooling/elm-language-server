import { URI } from "vscode-uri";
import { ElmWorkspace } from "../elmWorkspace";
import { NoWorkspaceContainsError } from "./noWorkspaceContainsError";

/**
 * Identifies the relevant ElmWorkspace for a given ParamType, either directly
 * (getElmWorkspaceFor) or when an event handler receives a ParamType
 * (handlerForWorkspace).
 */
export class ElmWorkspaceMatcher<ParamType> {
  constructor(
    protected readonly elmWorkspaces: ElmWorkspace[],
    protected readonly getUriFor: (param: ParamType) => URI,
  ) {}

  public handlerForWorkspace<ResultType>(
    handler: (param: ParamType, elmWorkspace: ElmWorkspace) => ResultType,
  ): (param: ParamType) => ResultType {
    return (param: ParamType) => {
      return handler(param, this.getElmWorkspaceFor(param));
    };
  }

  public getElmWorkspaceFor(param: ParamType): ElmWorkspace {
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
