import { expect, jest } from "@jest/globals";
import { container } from "tsyringe";
import { Connection, Range } from "vscode-languageserver";
import { Utils as UriUtils } from "vscode-uri";
import { IMoveParams } from "../src/common/protocol.js";
import { MoveRefactoringHandler } from "../src/common/providers/handlers/moveRefactoringHandler.js";
import { SourceTreeParser, srcUri } from "./utils/sourceTreeParser.js";

describe("MoveRefactoringHandler", () => {
  it("marks applied move edits as refactoring", async () => {
    const treeParser = new SourceTreeParser();
    await treeParser.init();
    const program = await treeParser.getProgram({
      "Source.elm": `module Source exposing (foo)

foo : Int
foo =
    1
`,
      "Destination.elm": `module Destination exposing (..)
`,
    });
    const sourceUri = UriUtils.joinPath(srcUri, "Source.elm").toString();
    const destinationUri = UriUtils.joinPath(
      srcUri,
      "Destination.elm",
    ).toString();
    const connection = container.resolve<Connection>("Connection");
    const workspace = connection.workspace as unknown as {
      applyEdit: jest.Mock;
    };
    workspace.applyEdit.mockClear();
    const handler = new MoveRefactoringHandler();

    await (
      handler as unknown as {
        handleMoveRequest(params: IMoveParams): Promise<void>;
      }
    ).handleMoveRequest({
      program,
      sourceUri,
      destination: {
        name: "Destination.elm",
        path: "",
        uri: destinationUri,
      },
      params: {
        textDocument: { uri: sourceUri },
        range: Range.create(2, 0, 2, 3),
        context: { diagnostics: [] },
      },
    });

    expect(workspace.applyEdit.mock.calls).toContainEqual([
      {
        label: "Move Function",
        edit: { changes: expect.any(Object) },
        metadata: { isRefactoring: true },
      },
    ]);
  });
});
