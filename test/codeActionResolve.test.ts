import { mockDeep } from "jest-mock-extended";
import { container } from "tsyringe";
import {
  CodeAction,
  CodeActionResolveRequest,
  CancellationTokenSource,
  Connection,
  RequestHandler,
  TextEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import {
  CodeActionProvider,
  IRefactorCodeAction,
} from "../src/common/providers/codeActionProvider";
import { DiagnosticsProvider } from "../src/common/providers/diagnostics/diagnosticsProvider";
import { ElmMakeDiagnostics } from "../src/common/providers/diagnostics/elmMakeDiagnostics";
import { Settings } from "../src/common/util/settings";
import { ISourceFile } from "../src/compiler/forest";
import { IProgram, IProgramHost } from "../src/compiler/program";

describe("code action resolve", () => {
  let resolveHandler: RequestHandler<CodeAction, CodeAction, void>;
  let provider: CodeActionProvider;

  beforeEach(() => {
    const connection = mockDeep<Connection>();
    const settings = mockDeep<Settings>();
    settings.isCodeActionResolveSupported.mockReturnValue(true);

    container.register("Connection", { useValue: connection });
    container.register("Settings", { useValue: settings });
    container.register(DiagnosticsProvider, {
      useValue: mockDeep<DiagnosticsProvider>(),
    });
    container.register(ElmMakeDiagnostics, {
      useValue: mockDeep<ElmMakeDiagnostics>(),
    });

    provider = new CodeActionProvider(mockDeep<IProgramHost>());
    const registration = (
      connection.onRequest.mock.calls as unknown as [unknown, unknown][]
    ).find(([method]) => method === CodeActionResolveRequest.method);
    if (!registration) {
      throw new Error("Code action resolve handler was not registered");
    }
    resolveHandler = registration[1] as RequestHandler<
      CodeAction,
      CodeAction,
      void
    >;
  });

  afterEach(() => {
    provider.dispose();
    container.resolve<IProgram[]>("ElmWorkspaces").splice(0);
  });

  it.each([
    { title: "No data" },
    { title: "Unrelated data", data: { fixId: "quick-fix" } },
  ])("returns $title unchanged", async (codeAction) => {
    const token = new CancellationTokenSource().token;
    const result = await Promise.resolve().then(() =>
      resolveHandler(codeAction, token),
    );
    expect(result).toBe(codeAction);
  });

  it("resolves edits for an Elm refactor action", async () => {
    const uri = URI.file("/workspace/src/Main.elm").toString();
    const sourceFile = mockDeep<ISourceFile>({ uri });
    const program = mockDeep<IProgram>({ isInitialized: true });
    program.hasDocument.mockReturnValue(true);
    program.getSourceFile.mockReturnValue(sourceFile);
    container.resolve<IProgram[]>("ElmWorkspaces").push(program);

    const edit = TextEdit.insert({ line: 0, character: 0 }, "module Main\n");
    CodeActionProvider.registerRefactorAction("testResolve", {
      getAvailableActions: () => [],
      getEditsForAction: () => ({ edits: [edit] }),
    });
    const codeAction: IRefactorCodeAction = {
      title: "Resolve refactor",
      data: {
        uri,
        refactorName: "testResolve",
        actionName: "apply",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
      },
    };

    const token = new CancellationTokenSource().token;
    await expect(resolveHandler(codeAction, token)).resolves.toEqual({
      ...codeAction,
      edit: { changes: { [uri]: [edit] } },
    });
  });
});
