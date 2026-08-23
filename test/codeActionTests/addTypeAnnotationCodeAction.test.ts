import { testCodeAction } from "./codeActionTestBase.js";
import { CodeActionKind } from "vscode-languageserver";

describe("add type annotation code action", () => {
  it("should annotate a type of functions", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

hello : String
hello =
    let
        value =
        --^
            "hello"
    in
    value
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

hello : String
hello =
    let
        value : String
        value =
            "hello"
    in
    value
`;

    await testCodeAction(
      source,
      [{ title: "Add inferred annotation" }],
      expectedSource,
    );
  });

  it("offers a refactor for top-level functions", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

hello =
--^
    "hello"
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

hello : String
hello =
    "hello"
`;

    await testCodeAction(
      source,
      [
        {
          title: "Add inferred annotation",
          kind: CodeActionKind.RefactorExtract,
        },
      ],
      expectedSource,
      { includeDiagnostics: false },
    );
  });

  it("does not duplicate the action when the diagnostic is enabled", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

hello =
--^
    "hello"
`;

    const actions = await testCodeAction(source, [
      {
        title: "Add inferred annotation",
        kind: CodeActionKind.QuickFix,
      },
    ]);

    expect(
      actions.filter(({ title }) => title === "Add inferred annotation"),
    ).toHaveLength(1);
  });
});
