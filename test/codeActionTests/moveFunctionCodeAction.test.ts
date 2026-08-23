import { container } from "tsyringe";
import { CodeActionKind } from "vscode-languageserver";
import { IClientSettings, Settings } from "../../src/common/util/settings.js";
import { testCodeAction } from "./codeActionTestBase.js";

describe("move function code action", () => {
  const originalSettings = container.resolve<Settings>("Settings");

  beforeAll(() => {
    container.register("Settings", {
      useValue: new Settings(
        {
          extendedCapabilities: {
            moveFunctionRefactoringSupport: true,
          },
        } as IClientSettings,
        {},
      ),
    });
  });

  afterAll(() => {
    container.register("Settings", { useValue: originalSettings });
  });

  it("classifies the action as a move refactoring", async () => {
    const source = `
--@ Test.elm
module Test exposing (foo)

foo : Int
--^
foo =
    1
`;

    await testCodeAction(
      source,
      [{ title: "Move Function", kind: CodeActionKind.RefactorMove }],
      undefined,
      { includeDiagnostics: false },
    );
  });
});
