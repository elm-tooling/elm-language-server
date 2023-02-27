import { mockDeep } from "jest-mock-extended";
import * as path from "../src/util/path";
import { container } from "tsyringe";
import {
  CancellationTokenSource,
  Connection,
  CreateFilesParams,
  DeleteFilesParams,
  HandlerResult,
  NotificationHandler,
  Position,
  Range,
  RenameFilesParams,
  RequestHandler,
  WorkspaceEdit,
} from "vscode-languageserver";
import { TextEdit } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { IProgram } from "../src/compiler/program";
import { FileEventsHandler } from "../src/providers/handlers/fileEventsHandler";
import { getSourceFiles } from "./utils/sourceParser";
import { SourceTreeParser, srcUri } from "./utils/sourceTreeParser";

describe("fileEventsHandler", () => {
  const treeParser = new SourceTreeParser();

  let createFilesHandler: NotificationHandler<CreateFilesParams>;
  let renameFilesHandler: RequestHandler<
    RenameFilesParams,
    WorkspaceEdit | null,
    never
  >;
  let deleteFilesHandler: RequestHandler<
    DeleteFilesParams,
    WorkspaceEdit | null,
    never
  >;
  let appliedWorkspaceEdit: WorkspaceEdit;

  container.register("Connection", {
    useValue: mockDeep<Connection>({
      workspace: {
        onDidCreateFiles: (handler) => {
          createFilesHandler = handler;
          return { dispose: () => {} };
        },
        onWillRenameFiles: (handler) => {
          renameFilesHandler = handler;
          return { dispose: () => {} };
        },
        onWillDeleteFiles: (handler) => {
          deleteFilesHandler = handler;
          return { dispose: () => {} };
        },
        applyEdit: (edit) => {
          if (WorkspaceEdit.is(edit)) {
            appliedWorkspaceEdit = edit;
          }

          return Promise.resolve({ applied: true });
        },
      },
    }),
  });

  const token = new CancellationTokenSource().token;

  async function createProgram(source: string): Promise<IProgram> {
    await treeParser.init();
    new FileEventsHandler();

    const program = await treeParser.getProgram(getSourceFiles(source));
    const workspaces = container.resolve<IProgram[]>("ElmWorkspaces");
    workspaces.splice(0, workspaces.length);
    workspaces.push(program);

    return program;
  }

  async function getEditFromResult(
    result: HandlerResult<WorkspaceEdit | null, never>,
  ): Promise<WorkspaceEdit> {
    return new Promise((resolve, reject) => {
      if (!result) {
        reject();
        return;
      }

      if ("then" in result) {
        (<any>result).then((edit: unknown) => {
          if (WorkspaceEdit.is(edit)) {
            resolve(edit);
          } else {
            reject();
          }
        });
      } else if (WorkspaceEdit.is(result)) {
        resolve(result);
      } else {
        reject();
      }
    });
  }

  function uri(uri: string, src = srcUri): string {
    return URI.file(path.join(src, uri)).toString();
  }

  it("handles file create event", async () => {
    await createProgram("");
    const newPath = uri("New/Module.elm");
    createFilesHandler({ files: [{ uri: newPath }] });

    const edit = appliedWorkspaceEdit;

    if (!edit.changes) {
      fail();
    }

    expect(edit.changes[newPath][0]).toEqual<TextEdit>({
      newText: "module New.Module exposing (..)",
      range: {
        start: {
          line: 0,
          character: 0,
        },
        end: {
          line: 0,
          character: 0,
        },
      },
    });
  });

  it("handles multiple files create event", async () => {
    await createProgram("");
    const newPath = uri("New/Module.elm");
    const newPath2 = uri("New/Another/Module.elm");
    createFilesHandler({ files: [{ uri: newPath }, { uri: newPath2 }] });

    const edit = appliedWorkspaceEdit;

    if (!edit.changes) {
      fail();
    }

    expect(edit.changes[newPath][0]).toEqual<TextEdit>({
      newText: "module New.Module exposing (..)",
      range: {
        start: {
          line: 0,
          character: 0,
        },
        end: {
          line: 0,
          character: 0,
        },
      },
    });

    expect(edit.changes[newPath2][0]).toEqual<TextEdit>({
      newText: "module New.Another.Module exposing (..)",
      range: {
        start: {
          line: 0,
          character: 0,
        },
        end: {
          line: 0,
          character: 0,
        },
      },
    });
  });

  it("handles file rename event", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func = ""
		`;
    const program = await createProgram(source);
    const oldPath = uri("Test.elm");
    const newPath = uri("Moved/Module.elm");
    const result = renameFilesHandler(
      { files: [{ oldUri: oldPath, newUri: newPath }] },
      token,
    );

    const edit = await getEditFromResult(result);

    if (!edit.changes) {
      fail();
    }

    expect(edit.changes[oldPath][0]).toEqual<TextEdit>({
      newText: "Moved.Module",
      range: Range.create(Position.create(0, 7), Position.create(0, 11)),
    });
  });

  it("handles folder rename event", async () => {
    const source = `
--@ Folder/TestA.elm
module Folder.TestA exposing (..)

func = ""

--@ Folder/TestB.elm
module Folder.TestB exposing (..)

func = ""

--@ Other/TestC.elm
module Other.TestC exposing (..)

func = ""
		`;
    const program = await createProgram(source);
    const oldPath = uri("Folder");
    const newPath = uri("Moved");
    const testAPath = uri("Folder/TestA.elm");
    const testBPath = uri("Folder/TestB.elm");
    const testCPath = uri("Other/TestC.elm");
    const result = renameFilesHandler(
      { files: [{ oldUri: oldPath, newUri: newPath }] },
      token,
    );

    const edit = await getEditFromResult(result);

    if (!edit.changes) {
      fail();
    }

    expect(edit.changes[testAPath][0]).toEqual<TextEdit>({
      newText: "Moved.TestA",
      range: {
        start: {
          line: 0,
          character: 7,
        },
        end: {
          line: 0,
          character: 19,
        },
      },
    });
    expect(edit.changes[testBPath][0]).toEqual<TextEdit>({
      newText: "Moved.TestB",
      range: {
        start: {
          line: 0,
          character: 7,
        },
        end: {
          line: 0,
          character: 19,
        },
      },
    });
    expect(edit.changes[testCPath]).toBeUndefined();
  });

  it("handles file delete event", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func = ""
		`;
    const program = await createProgram(source);
    const deleteUri = uri("Test.elm");

    expect(program.getSourceFile(deleteUri)).not.toBeUndefined();
    const result = deleteFilesHandler({ files: [{ uri: deleteUri }] }, token);

    expect(result).toBeNull();
    expect(program.getSourceFile(deleteUri)).toBeUndefined();
  });
});
