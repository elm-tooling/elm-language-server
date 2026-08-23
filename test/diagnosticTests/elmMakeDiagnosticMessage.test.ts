import { describe, expect, test } from "@jest/globals";
import { CodeActionParams, MarkupKind, Range } from "vscode-languageserver";
import { container } from "tsyringe";
import {
  IDiagnostic,
  toLspDiagnostic,
} from "../../src/common/providers/diagnostics/diagnosticsProvider.js";
import {
  ElmMakeDiagnostics,
  renderElmCompilerMessage,
} from "../../src/common/providers/diagnostics/elmMakeDiagnostics.js";

describe("Elm Make diagnostic messages", () => {
  test("renders compiler styles as Markdown and escapes their contents", () => {
    expect(
      renderElmCompilerMessage([
        "Expected ",
        {
          bold: true,
          underline: true,
          color: "RED",
          string: "List_a*",
        },
        " but got #value",
      ]),
    ).toBe("Expected **<u>*List\\_a\\**</u>** but got \\#value");
  });

  test("keeps adjacent and whitespace-padded styles unambiguous", () => {
    expect(
      renderElmCompilerMessage([
        { bold: false, underline: false, color: "RED", string: "one" },
        { bold: true, underline: false, color: "", string: "two" },
        { bold: true, underline: false, color: "", string: " three " },
      ]),
    ).toBe("*one*<!-- -->**two**<!-- --> **three** ");
  });

  test("publishes Markdown only when supported", () => {
    const diagnostic: IDiagnostic = {
      range: Range.create(0, 0, 0, 1),
      message: "TYPE MISMATCH - Expected #List_a*#",
      markupMessage: "TYPE MISMATCH \\- Expected **<u>*List\\_a\\**</u>**",
      source: "Elm",
      data: { uri: "src/Main.elm", code: "elm_make" },
    };

    expect(toLspDiagnostic(diagnostic, true).message).toEqual({
      kind: MarkupKind.Markdown,
      value: diagnostic.markupMessage,
    });
    expect(toLspDiagnostic(diagnostic, false).message).toBe(diagnostic.message);
    expect(toLspDiagnostic(diagnostic, true)).not.toHaveProperty(
      "markupMessage",
    );
  });

  test("keeps plain compiler text available to quick fixes", () => {
    const diagnostic: IDiagnostic = {
      range: Range.create(0, 0, 0, 3),
      message: "NAMING ERROR - Did you mean this?\n    #foo#",
      markupMessage: "NAMING ERROR \\- Did you mean this?\n    **foo**",
      source: "Elm",
      data: { uri: "src/Main.elm", code: "elm_make" },
    };
    const publishedDiagnostic = toLspDiagnostic(diagnostic, true);
    const params = {
      textDocument: { uri: "file:///workspace/src/Main.elm" },
      context: { diagnostics: [publishedDiagnostic] },
    } as CodeActionParams;

    expect(container.resolve(ElmMakeDiagnostics).onCodeAction(params)).toEqual([
      expect.objectContaining({
        title: "Change to `foo`",
        edit: {
          changes: {
            "file:///workspace/src/Main.elm": [
              { range: publishedDiagnostic.range, newText: "foo" },
            ],
          },
        },
      }),
    ]);
  });
});
