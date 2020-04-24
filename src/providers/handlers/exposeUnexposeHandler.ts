import { IConnection } from "vscode-languageserver";
import { IElmWorkspace } from "../../elmWorkspace";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { URI } from "vscode-uri";
import { ExposeRequest, UnexposeRequest } from "../../protocol";
import { IExposeUnexposeParams } from "../../protocol";
import { RefactorEditUtils } from "../../util/refactorEditUtils";

export class ExposeUnexposeHandler {
  constructor(private connection: IConnection, elmWorkspaces: IElmWorkspace[]) {
    this.connection.onRequest(
      ExposeRequest,
      new ElmWorkspaceMatcher(elmWorkspaces, (params: IExposeUnexposeParams) =>
        URI.parse(params.uri),
      ).handlerForWorkspace(this.handleExposeRequest.bind(this)),
    );

    this.connection.onRequest(
      UnexposeRequest,
      new ElmWorkspaceMatcher(elmWorkspaces, (params: IExposeUnexposeParams) =>
        URI.parse(params.uri),
      ).handlerForWorkspace(this.handleUnexposeRequest.bind(this)),
    );
  }

  private handleExposeRequest(
    params: IExposeUnexposeParams,
    elmWorkspace: IElmWorkspace,
  ) {
    const forest = elmWorkspace.getForest();
    const tree = forest.getTree(params.uri);

    if (tree) {
      const edits = RefactorEditUtils.exposeValueInModule(tree, params.name);

      if (edits) {
        this.connection.workspace.applyEdit({
          changes: {
            [params.uri]: [edits],
          },
        });
      }
    }
  }

  private handleUnexposeRequest(
    params: IExposeUnexposeParams,
    elmWorkspace: IElmWorkspace,
  ) {
    const forest = elmWorkspace.getForest();
    const tree = forest.getTree(params.uri);

    if (tree) {
      const edits = RefactorEditUtils.unexposedValueInModule(tree, params.name);

      if (edits) {
        this.connection.workspace.applyEdit({
          changes: {
            [params.uri]: [edits],
          },
        });
      }
    }
  }
}
