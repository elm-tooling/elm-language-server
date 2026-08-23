import { mockDeep } from "jest-mock-extended";
import { container } from "tsyringe";
import {
  CancellationTokenSource,
  Connection,
  RequestHandler,
} from "vscode-languageserver";
import { VirtualFileProvider } from "../src/common/providers/virtualFileProvider.js";
import { Settings } from "../src/common/util/settings.js";
import { ISourceFile } from "../src/compiler/forest.js";
import { IProgram } from "../src/compiler/program.js";

describe("VirtualFileProvider", () => {
  it("serves virtual Elm source through the standard request", async () => {
    const connection = mockDeep<Connection>();
    const settings = mockDeep<Settings>();
    settings.isTextDocumentContentSupported.mockReturnValue(true);
    const uri = "elm-virtual-file://package/elm/core/1.0.0/src/Basics.elm";
    const sourceFile = {
      tree: { rootNode: { text: "module Basics exposing (..)" } },
    } as ISourceFile;
    const program = mockDeep<IProgram>({ isInitialized: true });
    program.hasDocument.mockReturnValue(true);
    program.getSourceFile.mockReturnValue(sourceFile);

    container.register("Connection", { useValue: connection });
    container.register("Settings", { useValue: settings });
    container.register("ElmWorkspaces", { useValue: [program] });

    new VirtualFileProvider();

    const handler =
      connection.workspace.textDocumentContent.on.mock.calls[0][0];
    const token = new CancellationTokenSource().token;

    await expect(handler({ uri }, token)).resolves.toEqual({
      text: "module Basics exposing (..)",
    });
  });

  it("keeps the custom request as a fallback", async () => {
    const connection = mockDeep<Connection>();
    const settings = mockDeep<Settings>();
    settings.isTextDocumentContentSupported.mockReturnValue(false);
    const uri = "elm-virtual-file://package/elm/core/1.0.0/src/Basics.elm";
    const sourceFile = {
      tree: { rootNode: { text: "module Basics exposing (..)" } },
    } as ISourceFile;
    const program = mockDeep<IProgram>({ isInitialized: true });
    program.hasDocument.mockReturnValue(true);
    program.getSourceFile.mockReturnValue(sourceFile);

    container.register("Connection", { useValue: connection });
    container.register("Settings", { useValue: settings });
    container.register("ElmWorkspaces", { useValue: [program] });

    new VirtualFileProvider();

    expect(connection.workspace.textDocumentContent.on.mock.calls).toHaveLength(
      0,
    );
    const handler = connection.onRequest.mock.calls[0][1] as RequestHandler<
      { uri: string },
      string,
      void
    >;
    const token = new CancellationTokenSource().token;

    await expect(handler({ uri }, token)).resolves.toBe(
      "module Basics exposing (..)",
    );
  });
});
