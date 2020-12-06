import { container } from "tsyringe";
import { Connection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import {
  ExposeRequest,
  IExposeUnexposeParams,
  UnexposeRequest,
} from "../../protocol";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { RefactorEditUtils } from "../../util/refactorEditUtils";

export class ExposeUnexposeHandler {
  private connection: Connection;

  constructor() {
    this.connection = container.resolve("Connection");
    this.connection.onRequest(
      ExposeRequest,
      new ElmWorkspaceMatcher((params: IExposeUnexposeParams) =>
        URI.parse(params.uri),
      ).handle(this.handleExposeRequest.bind(this)),
    );

    this.connection.onRequest(
      UnexposeRequest,
      new ElmWorkspaceMatcher((params: IExposeUnexposeParams) =>
        URI.parse(params.uri),
      ).handle(this.handleUnexposeRequest.bind(this)),
    );
  }

  private async handleExposeRequest(
    params: IExposeUnexposeParams,
  ): Promise<void> {
    const tree = params.sourceFile.tree;

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
  ): Promise<void> {
    const tree = params.sourceFile.tree;

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
