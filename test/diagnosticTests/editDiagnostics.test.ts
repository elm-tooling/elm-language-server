import { expect, it } from "@jest/globals";
import { mockDeep } from "jest-mock-extended";
import { container } from "tsyringe";
import {
  DidChangeTextDocumentParams,
  DidOpenTextDocumentParams,
  Emitter,
  TextDocumentContentChangeEvent,
} from "vscode-languageserver";
import { Utils as UriUtils } from "vscode-uri";
import { ASTProvider } from "../../src/common/providers/astProvider.js";
import { ElmLsDiagnostics } from "../../src/common/providers/diagnostics/elmLsDiagnostics.js";
import { IDocumentEvents } from "../../src/common/util/documentEvents.js";
import { TextDocumentEvents } from "../../src/common/util/textDocumentEvents.js";
import { IFileSystemHost } from "../../src/common/types.js";
import { SourceTreeParser, srcUri } from "../utils/sourceTreeParser.js";

// Exercise editor notifications, document storage, incremental AST updates, and
// diagnostics together. Parsing each revision from scratch would miss #1341's
// reported failure mode: nonsense diagnostics after otherwise ordinary edits.
it.each(["\n", "\r\n"])(
  "keeps parser and unused-pattern diagnostics in sync with edits using %j",
  async (newline) => {
    const parser = new SourceTreeParser();
    await parser.init();
    const source = [
      "module Main exposing (..)",
      "-- café 😀",
      "type Msg",
      "    = First",
      "    | Second",
      "",
      "update msg model =",
      "    case msg of",
      "        First -> model",
      "        Second -> model",
      "",
    ].join(newline);
    const program = await parser.getProgram({ "Main.elm": source });
    const uri = UriUtils.joinPath(srcUri, "Main.elm").toString();
    const open = new Emitter<DidOpenTextDocumentParams>();
    const change = new Emitter<DidChangeTextDocumentParams>();
    container.register("ElmWorkspaces", { useValue: [program] });
    container.register("DocumentEvents", {
      useValue: mockDeep<IDocumentEvents>({
        onDidOpen: open.event,
        onDidChange: change.event,
      }),
    });
    const documents = new TextDocumentEvents();
    container.register(TextDocumentEvents, { useValue: documents });
    // All changes are to the open buffer. Disk reads must not supply its text.
    new ASTProvider(mockDeep<IFileSystemHost>());
    const settle = (): Promise<void> =>
      new Promise((resolve) => setImmediate(resolve));
    const elmLsDiagnostics = new ElmLsDiagnostics();
    let version = 1;
    const edit = (contentChanges: TextDocumentContentChangeEvent[]): void => {
      change.fire({
        textDocument: { uri, version: ++version },
        contentChanges,
      });
    };
    const insert = (
      line: number,
      character: number,
      text: string,
    ): TextDocumentContentChangeEvent => ({
      range: {
        start: { line, character },
        end: { line, character },
      },
      text,
    });
    const getDiagnostics = () => {
      const file = program.getSourceFile(uri)!;
      expect(file.tree.rootNode.text).toBe(documents.get(uri)!.getText());
      return [
        ...program.getSyntacticDiagnostics(file),
        ...program.getSemanticDiagnostics(file),
        ...elmLsDiagnostics
          .createDiagnostics(file, program)
          .map((diagnostic) => ({
            ...diagnostic,
            code: diagnostic.data.code,
          })),
      ];
    };

    try {
      open.fire({
        textDocument: { uri, languageId: "elm", version, text: source },
      });
      await settle();
      expect(getDiagnostics()).toEqual([]);

      // The public reproduction adds a Msg variant. A missing case is real;
      // parser errors or unused substrings elsewhere in the file are not.
      edit([insert(4, 12, newline + "    | NewMessage")]);
      await settle();
      expect(
        getDiagnostics()
          .map((diagnostic) => diagnostic.code)
          .sort(),
      ).toEqual(["incomplete_case_pattern"]);
      edit([insert(10, 23, newline + "        NewMessage -> model")]);
      await settle();
      expect(getDiagnostics()).toEqual([]);

      // A real unused variable is a positive control for the warning path.
      edit([insert(7, 16, " unused")]);
      await settle();
      expect(getDiagnostics()).toEqual([
        expect.objectContaining({
          code: "unused_pattern",
          message: "Unused pattern variable `unused`",
          range: {
            start: { line: 7, character: 17 },
            end: { line: 7, character: 23 },
          },
        }),
      ]);
      edit([
        {
          range: {
            start: { line: 7, character: 16 },
            end: { line: 7, character: 23 },
          },
          text: "",
        },
      ]);
      await settle();
      expect(getDiagnostics()).toEqual([]);

      // Insert at a UTF-16 character offset following an astral character, and
      // include multiple changes whose ranges refer to successive revisions.
      edit([
        insert(1, 10, " more"),
        insert(1, 15, newline + "-- another line"),
      ]);
      await settle();
      expect(getDiagnostics()).toEqual([]);

      const validText = documents.get(uri)!.getText();
      const end = documents.get(uri)!.positionAt(validText.length);
      edit([insert(end.line, end.character, newline + "broken = (")]);
      await settle();
      expect(getDiagnostics()).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "parsing" })]),
      );
      edit([
        {
          range: {
            start: end,
            end: documents
              .get(uri)!
              .positionAt(documents.get(uri)!.getText().length),
          },
          text: "",
        },
      ]);
      await settle();
      expect(getDiagnostics()).toEqual([]);

      // Full-document undo must clear cached diagnostics and restore ranges.
      edit([{ text: source }]);
      await settle();
      expect(getDiagnostics()).toEqual([]);
    } finally {
      program.getSourceFiles().forEach((file) => file.tree.delete());
      program.dispose();
      open.dispose();
      change.dispose();
    }
  },
);
