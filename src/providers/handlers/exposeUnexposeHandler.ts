import { container } from "tsyringe";
import { IConnection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { IElmWorkspace } from "../../elmWorkspace";
import {
  ExposeRequest,
  IExposeUnexposeParams,
  UnexposeRequest,
} from "../../protocol";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { RefactorEditUtils } from "../../util/refactorEditUtils";

export class ExposeUnexposeHandler {
  private connection: IConnection;

  constructor() {
    this.connection = container.resolve("Connection");
    this.connection.onRequest(
      ExposeRequest,
      new ElmWorkspaceMatcher((params: IExposeUnexposeParams) =>
        URI.parse(params.uri),
      ).handlerForWorkspace(this.handleExposeRequest.bind(this)),
    );

    this.connection.onRequest(
      UnexposeRequest,
      new ElmWorkspaceMatcher((params: IExposeUnexposeParams) =>
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
