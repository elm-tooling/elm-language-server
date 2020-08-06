import { IConnection } from "vscode-languageserver";
import { IElmWorkspace } from "../../elmWorkspace";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { URI } from "vscode-uri";
import { ExposeRequest, UnexposeRequest } from "../../protocol";
import { IExposeUnexposeParams } from "../../protocol";
import { RefactorEditUtils } from "../../util/refactorEditUtils";
import { container } from "tsyringe";

export class ExposeUnexposeHandler {
  private connection: IConnection;
  constructor(elmWorkspaces: IElmWorkspace[]) {
    this.connection = container.resolve("Connection");
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

  private async handleExposeRequest(
    params: IExposeUnexposeParams,
    elmWorkspace: IElmWorkspace,
  ): Promise<void> {
    const forest = elmWorkspace.getForest();
    const tree = forest.getTree(params.uri);

    if (tree) {
      const edits = RefactorEditUtils.exposeValueInModule(tree, params.name);

      if (edits) {
        await this.connection.workspace.applyEdit({
          changes: {
            [params.uri]: [edits],
          },
        });
      }
    }
  }

  private async handleUnexposeRequest(
    params: IExposeUnexposeParams,
    elmWorkspace: IElmWorkspace,
  ): Promise<void> {
    const forest = elmWorkspace.getForest();
    const tree = forest.getTree(params.uri);

    if (tree) {
      const edits = RefactorEditUtils.unexposedValueInModule(tree, params.name);

      if (edits) {
        await this.connection.workspace.applyEdit({
          changes: {
            [params.uri]: [edits],
          },
        });
      }
    }
  }
}
