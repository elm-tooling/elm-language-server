import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { container } from "tsyringe";
import {
  DiagnosticSeverity,
  DiagnosticTag,
  Range,
} from "vscode-languageserver";
import { Utils as UriUtils } from "vscode-uri";
import { IElmAnalyseJsonService } from "../../src/common/providers/diagnostics/elmAnalyseJsonService.js";
import { ElmLsDiagnostics } from "../../src/common/providers/diagnostics/elmLsDiagnostics.js";
import { IDiagnostic } from "../../src/common/providers/diagnostics/diagnosticsProvider.js";
import { SourceTreeParser, srcUri } from "../utils/sourceTreeParser.js";

describe("unused incoming ports", () => {
  const parser = new SourceTreeParser();
  const uri = UriUtils.joinPath(srcUri, "Ports.elm").toString();
  const warning = {
    range: Range.create(1, 5, 1, 11),
    message: "Incoming port `inPort` is never referenced in Elm code.",
    severity: DiagnosticSeverity.Warning,
    source: "ElmLS",
    tags: [DiagnosticTag.Unnecessary],
    data: { uri, code: "unused_incoming_port" },
  };

  afterEach(() => jest.restoreAllMocks());

  async function diagnose(
    ports: string,
    otherSources: Record<string, string> = {},
  ): Promise<IDiagnostic[]> {
    await parser.init();
    const program = await parser.getProgram({
      "Platform/Sub.elm":
        "module Platform.Sub exposing (Sub)\ntype Sub msg = Sub",
      "Platform/Cmd.elm":
        "module Platform.Cmd exposing (Cmd)\ntype Cmd msg = Cmd",
      "Ports.elm": ports,
      ...otherSources,
    });
    const sourceFile = program.getSourceFile(uri);
    if (!sourceFile) {
      throw new Error("Ports.elm was not loaded");
    }
    return new ElmLsDiagnostics()
      .createDiagnostics(sourceFile, program)
      .filter((diagnostic) => diagnostic.data.code === "unused_incoming_port");
  }

  const unused = `port module Ports exposing (..)
port inPort : (String -> msg) -> Sub msg`;

  it.each(["..", "inPort", ""])(
    "warns for an unused incoming port with exposing (%s)",
    async (exposing) => {
      expect(await diagnose(unused.replace("(..)", `(${exposing})`))).toEqual([
        warning,
      ]);
    },
  );

  it("does not count an import exposing entry as usage", async () => {
    expect(
      await diagnose(unused, {
        "Main.elm": "module Main exposing (..)\nimport Ports exposing (inPort)",
      }),
    ).toEqual([warning]);
  });

  it.each([
    ["import Ports", "Ports.inPort"],
    ["import Ports as P", "P.inPort"],
    ["import Ports exposing (inPort)", "inPort"],
    ["import Ports exposing (..)", "inPort"],
  ])("counts cross-module usage with %s", async (importClause, reference) => {
    expect(
      await diagnose(unused, {
        "Main.elm": `module Main exposing (..)\n${importClause}\nsubscriptions = ${reference} identity`,
      }),
    ).toEqual([]);
  });

  it("counts a local subscription", async () => {
    expect(
      await diagnose(`${unused}\nsubscriptions = inPort identity`),
    ).toEqual([]);
  });

  it("conservatively counts a reference in an unused function", async () => {
    expect(await diagnose(`${unused}\nunusedFunction _ = inPort`)).toEqual([]);
  });

  it("does not count comments or strings as usage", async () => {
    expect(
      await diagnose(`${unused}\n-- inPort identity\ntext = "inPort"`),
    ).toEqual([warning]);
  });

  it("does not count a parameter that shadows an imported port", async () => {
    expect(
      await diagnose(unused, {
        "Main.elm": `module Main exposing (..)
import Ports exposing (inPort)
subscriptions inPort = inPort identity`,
      }),
    ).toEqual([warning]);
  });

  it("does not confuse another module's port with this port", async () => {
    expect(
      await diagnose(unused, {
        "Other.elm": unused.replace("Ports", "Other"),
        "Main.elm":
          "module Main exposing (..)\nimport Other\nsubscriptions = Other.inPort identity",
      }),
    ).toEqual([warning]);
  });

  it("distinguishes outgoing ports even when their argument is a function", async () => {
    expect(
      await diagnose(`port module Ports exposing (..)
port outPort : String -> Cmd msg
port another : (String -> msg) -> Cmd msg`),
    ).toEqual([]);
  });

  it("recognizes qualified incoming types", async () => {
    expect(await diagnose(unused.replace("Sub msg", "Sub.Sub msg"))).toEqual([
      warning,
    ]);
  });

  it("recognizes aliases for incoming types", async () => {
    expect(
      await diagnose(
        `${unused.replace("Sub msg", "Subscription msg")}\ntype alias Subscription msg = Sub msg`,
      ),
    ).toEqual([warning]);
  });

  it("skips unresolved types", async () => {
    expect(await diagnose(unused.replace("Sub msg", "Unknown msg"))).toEqual(
      [],
    );
  });

  it("can be disabled in elm-analyse.json", async () => {
    const service = container.resolve<IElmAnalyseJsonService>(
      "ElmAnalyseJsonService",
    );
    jest.spyOn(service, "getElmAnalyseJson").mockReturnValue({
      checks: { UnusedIncomingPort: false },
    });
    expect(await diagnose(unused)).toEqual([]);
  });

  it("respects excluded paths", async () => {
    const service = container.resolve<IElmAnalyseJsonService>(
      "ElmAnalyseJsonService",
    );
    jest.spyOn(service, "isFileExcluded").mockReturnValue(true);
    expect(await diagnose(unused)).toEqual([]);
  });
});
