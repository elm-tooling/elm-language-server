import { mockDeep } from "jest-mock-extended";
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
import { TextDocument, TextEdit } from "vscode-languageserver-textdocument";
import { Utils } from "vscode-uri";
import { IFileSystemHost } from "../src/common/types.js";
import { TextDocumentEvents } from "../src/common/util/textDocumentEvents.js";
import { IProgram } from "../src/compiler/program.js";
import { FileEventsHandler } from "../src/common/providers/handlers/fileEventsHandler.js";
import { ASTProvider } from "../src/common/providers/astProvider.js";
import { IFileChangeParams } from "../src/common/providers/paramsExtensions.js";
import { getSourceFiles } from "./utils/sourceParser.js";
import {
  applyEditsToSource,
  SourceTreeParser,
  srcUri,
  testsUri,
} from "./utils/sourceTreeParser.js";

class FileEventASTProvider extends ASTProvider {
  public change(params: IFileChangeParams): Promise<void> {
    return this.handleChangeTextDocument(params);
  }
}

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

  let resolveCreateFiles: () => void;
  let createFilesPromise: Promise<void>;
  const host = mockDeep<IFileSystemHost>();
  const documents = mockDeep<TextDocumentEvents>();
  container.register(TextDocumentEvents, { useValue: documents });

  function onDidCreateFile(): void {
    resolveCreateFiles();
  }

  container.register("Connection", {
    useValue: mockDeep<Connection>({
      workspace: {
        onDidCreateFiles: (handler) => {
          createFilesHandler = handler;
          createFilesPromise = new Promise((resolve) => {
            resolveCreateFiles = resolve;
          });
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
    const sources = getSourceFiles(source);
    host.readFile.mockImplementation((fileUri) =>
      Promise.resolve(
        sources[fileUri.path.slice(srcUri.path.length + 1)] ?? "",
      ),
    );
    documents.get.mockReturnValue(undefined);
    new FileEventsHandler(host, onDidCreateFile);

    const program = await treeParser.getProgram(sources);
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
    return Utils.joinPath(src, uri).toString();
  }

  it("handles file create event", async () => {
    await createProgram("");
    const newPath = uri("New/Module.elm");
    await createFilesHandler({ files: [{ uri: newPath }] });
    await createFilesPromise;

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
    await createFilesHandler({ files: [{ uri: newPath }, { uri: newPath2 }] });
    await createFilesPromise;

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
    await createProgram(source);
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

  it("preserves a copied module on create", async () => {
    await createProgram(`
--@ B.elm
module B exposing (..)
--@ Copy.elm
module B exposing (..)
`);
    const copiedPath = uri("Copy.elm");
    await createFilesHandler({ files: [{ uri: copiedPath }] });
    await createFilesPromise;
    expect(appliedWorkspaceEdit.changes?.[copiedPath]).toBeUndefined();
  });

  it.each(["Copy.elm", "B copy.elm"])(
    "preserves unparsed copied contents: %s",
    async (name) => {
      await createProgram("");
      host.readFile.mockResolvedValue("module B exposing (..)\n");
      const copiedPath = uri(name);
      await createFilesHandler({ files: [{ uri: copiedPath }] });
      await createFilesPromise;
      expect(appliedWorkspaceEdit.changes?.[copiedPath]).toBeUndefined();
    },
  );

  it("preserves an unsaved editor buffer when the disk file is empty", async () => {
    await createProgram("");
    const copiedPath = uri("Copy.elm");
    documents.get.mockReturnValue(
      TextDocument.create(copiedPath, "elm", 1, "module B exposing (..)"),
    );
    await createFilesHandler({ files: [{ uri: copiedPath }] });
    await createFilesPromise;
    expect(appliedWorkspaceEdit.changes?.[copiedPath]).toBeUndefined();
  });

  it("does not scaffold a file whose contents cannot be read", async () => {
    await createProgram("");
    host.readFile.mockRejectedValue(new Error("Unreadable file"));
    const newPath = uri("New.elm");
    await createFilesHandler({ files: [{ uri: newPath }] });
    await createFilesPromise;
    expect(appliedWorkspaceEdit.changes?.[newPath]).toBeUndefined();
  });

  it.each(["B copy.elm", "lowercase.elm", "New.txt", "Bad-Name.elm"])(
    "does not scaffold an invalid module path: %s",
    async (name) => {
      await createProgram("");
      const newPath = uri(name);
      await createFilesHandler({ files: [{ uri: newPath }] });
      await createFilesPromise;
      expect(appliedWorkspaceEdit.changes?.[newPath]).toBeUndefined();
    },
  );

  it("renames a copy without rewriting imports of the original", async () => {
    const program = await createProgram(`
--@ A.elm
module A exposing (..)
import B
value = B.value
--@ B.elm
module B exposing (..)
value = 1
--@ Copy.elm
module B exposing (..)
value = 1
`);
    const originalTestMapping = program
      .getSourceFile(uri("B.elm"))
      ?.project.testModuleToUriMap.get("B");
    const result = await renameFilesHandler(
      { files: [{ oldUri: uri("Copy.elm"), newUri: uri("C.elm") }] },
      token,
    );
    const edit = await getEditFromResult(result);
    expect(edit.changes?.[uri("A.elm")]).toBeUndefined();
    expect(edit.changes?.[uri("B.elm")]).toBeUndefined();
    expect(edit.changes?.[uri("Copy.elm")]?.[0].newText).toBe("C");
    expect(
      program.getSourceFile(uri("B.elm"))?.project.moduleToUriMap.get("B"),
    ).toBe(uri("B.elm"));
    expect(
      program.getSourceFile(uri("B.elm"))?.project.testModuleToUriMap.get("B"),
    ).toBe(originalTestMapping);
  });

  it("preserves the original test module mapping when renaming a copy", async () => {
    const program = await createProgram(`
--@ tests/B.elm
module B exposing (..)
--@ tests/Copy.elm
module B exposing (..)
`);
    const originalUri = uri("B.elm", testsUri);
    const project = program.getSourceFile(originalUri)?.project;
    expect(project?.testModuleToUriMap.get("B")).toBe(originalUri);
    await renameFilesHandler(
      {
        files: [
          { oldUri: uri("Copy.elm", testsUri), newUri: uri("C.elm", testsUri) },
        ],
      },
      token,
    );
    expect(project?.testModuleToUriMap.get("B")).toBe(originalUri);
  });

  it("decodes Unicode module paths before scaffolding", async () => {
    await createProgram("");
    const newPath = uri("Ünicode/Module.elm");
    await createFilesHandler({ files: [{ uri: newPath }] });
    await createFilesPromise;
    expect(appliedWorkspaceEdit.changes?.[newPath]?.[0].newText).toBe(
      "module Ünicode.Module exposing (..)",
    );
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
    await createProgram(source);
    const oldPath = uri("Folder");
    const newPath = uri("Moved");
    const testAPath = uri("Folder/TestA.elm");
    const testBPath = uri("Folder/TestB.elm");
    const testCPath = uri("Other/TestC.elm");
    const result = await renameFilesHandler(
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

  it.each([false, true])(
    "keeps module resolution after a move, importer edited first: %s",
    async (importerFirst) => {
      const program = await createProgram(`
--@ A.elm
module A exposing (..)
import B
value = B.Value
--@ B.elm
module B exposing (..)
type Value = Value
`);
      const previousAST = container.resolve(ASTProvider);
      const ast = new FileEventASTProvider(host);
      container.register(ASTProvider, { useValue: ast });
      try {
        new FileEventsHandler(host, onDidCreateFile);
        const original = program.getSourceFile(uri("B.elm"));
        const importer = program.getSourceFile(uri("A.elm"));
        if (!original || !importer) throw new Error("Missing test modules");
        const before = program
          .getSemanticDiagnostics(importer)
          .map(({ code }) => code);
        expect(before).toEqual([]);
        const edit = await getEditFromResult(
          await renameFilesHandler(
            { files: [{ oldUri: original.uri, newUri: uri("Moved/B.elm") }] },
            token,
          ),
        );
        expect(edit.changes?.[importer.uri]).toBeDefined();
        for (const sourceFile of importerFirst
          ? [importer, original]
          : [original, importer]) {
          const text = applyEditsToSource(
            sourceFile.tree.rootNode.text,
            edit.changes?.[sourceFile.uri] ?? [],
          );
          host.readFile.mockResolvedValue(text);
          await ast.change({ uri: sourceFile.uri, program, sourceFile });
        }
        expect(program.getSourceFile(original.uri)).toBeUndefined();
        expect(program.getSourceFile(uri("Moved/B.elm"))?.moduleName).toBe(
          "Moved.B",
        );
        const movedImporter = program.getSourceFile(importer.uri);
        if (!movedImporter) throw new Error("Missing importer after move");
        expect(movedImporter.tree.rootNode.text).toContain(
          "value = Moved.B.Value",
        );
        expect(movedImporter.resolvedModules?.get("Moved.B")).toBe(
          uri("Moved/B.elm"),
        );
        expect(
          program.getSemanticDiagnostics(movedImporter).map(({ code }) => code),
        ).toEqual(before);
      } finally {
        container.register(ASTProvider, { useValue: previousAST });
      }
    },
  );

  it("updates qualified types and constructors without changing aliases or nested modules", async () => {
    const source = `
--@ A.elm
module A exposing (..)
import B
import B.Nested
value : B.Value
value = B.Value
unwrap input =
    case input of
        B.Value -> B.value
nested = B.Nested.value
--@ Alias.elm
module Alias exposing (..)
import B as B
value : B.Value
value = B.Value
--@ B.elm
module B exposing (..)
type Value = Value
value = Value
--@ B/Nested.elm
module B.Nested exposing (..)
value = ()
`;
    const program = await createProgram(source);
    const edit = await getEditFromResult(
      await renameFilesHandler(
        { files: [{ oldUri: uri("B.elm"), newUri: uri("Moved/B.elm") }] },
        token,
      ),
    );
    const rewrite = (name: string): string => {
      const sourceFile = program.getSourceFile(uri(name));
      if (!sourceFile) throw new Error(`Missing test module ${name}`);
      return applyEditsToSource(
        sourceFile.tree.rootNode.text,
        edit.changes?.[uri(name)] ?? [],
      );
    };
    expect(rewrite("A.elm")).toBe(
      getSourceFiles(source)
        ["A.elm"].replaceAll("import B\n", "import Moved.B\n")
        .replaceAll("B.Value", "Moved.B.Value")
        .replaceAll("B.value", "Moved.B.value"),
    );
    expect(rewrite("Alias.elm")).toBe(
      getSourceFiles(source)["Alias.elm"].replace(
        "import B as B",
        "import Moved.B as B",
      ),
    );
    expect(edit.changes?.[uri("B/Nested.elm")]).toBeUndefined();
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
    const result = await deleteFilesHandler(
      { files: [{ uri: deleteUri }] },
      token,
    );

    expect(result).toBeNull();
    expect(program.getSourceFile(deleteUri)).toBeUndefined();
  });
});
