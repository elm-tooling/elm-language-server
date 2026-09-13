import { container } from "tsyringe";
import { ClientCapabilities, MarkupContent } from "vscode-languageserver";
import { URI, Utils } from "vscode-uri";
import { HoverProvider, HoverResult } from "../src/common/providers/index.js";
import { ITextDocumentPositionParams } from "../src/common/providers/paramsExtensions.js";
import { getInvokePositionFromSource } from "./utils/sourceParser.js";
import { baseUri, SourceTreeParser, srcUri } from "./utils/sourceTreeParser.js";
import { Settings } from "../src/common/util/settings.js";

class MockHoverProvider extends HoverProvider {
  handleHover = (params: ITextDocumentPositionParams): HoverResult => {
    return this.handleHoverRequest(params);
  };
}

describe("HoverProvider", () => {
  const treeParser = new SourceTreeParser();

  async function testHover(
    source: string,
    expectContains: string,
    capabilities: ClientCapabilities = {},
  ): Promise<string | undefined> {
    container.register("Settings", {
      useValue: new Settings({} as never, capabilities),
    });
    await treeParser.init();
    const hoverProvider = new MockHoverProvider();

    const { invokePosition, invokeFile, sources } =
      getInvokePositionFromSource(source);

    if (!invokePosition) {
      throw new Error("Getting position failed");
    }

    const testUri = Utils.joinPath(
      invokeFile.startsWith("tests") ? URI.file(baseUri) : srcUri,
      invokeFile,
    ).toString();

    const program = await treeParser.getProgram(sources);
    const sourceFile = program.getSourceFile(testUri);

    if (!sourceFile) throw new Error("Getting source file failed");

    const hover = hoverProvider.handleHover({
      textDocument: { uri: testUri },
      position: invokePosition,
      program,
      sourceFile,
    });

    if (!hover) {
      expect(hover).toBeTruthy();
      return;
    }

    if (MarkupContent.is(hover.contents)) {
      expect(hover.contents.value).toContain(expectContains);
      return hover.contents.value;
    } else {
      expect(MarkupContent.is(hover.contents)).toBeTruthy();
    }
  }

  const markdownCapabilities: ClientCapabilities = {
    textDocument: {
      hover: { contentFormat: ["markdown"] },
      typeDefinition: { linkSupport: false },
    },
  };
  const parameterSource = `
--@ Test.elm
module Test exposing (..)

type alias Person = { firstname : String }

getFirstname : Person -> String
getFirstname person =
    person.firstname
  --^
`;

  it("links an annotated parameter to its alias beneath the hover text", async () => {
    const value = await testHover(
      parameterSource,
      "person : Person",
      markdownCapabilities,
    );
    expect(value).toContain(
      `\n\n[Go to Person](<${Utils.joinPath(srcUri, "Test.elm").toString()}#L3>)`,
    );
  });

  it.each([{}, { textDocument: { hover: { contentFormat: ["plaintext"] } } }])(
    "omits links without advertised Markdown hover support: %j",
    async (capabilities) => {
      const value = await testHover(
        parameterSource,
        "person : Person",
        capabilities as ClientCapabilities,
      );
      expect(value).not.toContain("[Go to");
    },
  );

  it("links an inferred case-pattern parameter", async () => {
    const value = await testHover(
      `
--@ Models.elm
module Models exposing (Person, Msg(..))

type alias Person = { firstname : String }
type Msg = Selected Person

--@ Test.elm
module Test exposing (..)
import Models exposing (Msg(..))

update msg =
    case msg of
        Selected person ->
            person
          --^
`,
      "person : Models.Person",
      markdownCapabilities,
    );
    expect(value).toContain(
      `[Go to Person](<${Utils.joinPath(srcUri, "Models.elm").toString()}#L3>)`,
    );
  });

  it("links an unannotated function parameter inferred from a constructor", async () => {
    const value = await testHover(
      `
--@ Test.elm
module Test exposing (..)
type Status = Ready
type Msg = Selected Status
select status = Selected status
                       --^
`,
      "status : Status",
      markdownCapabilities,
    );
    expect(value).toContain(
      `[Go to Status](<${Utils.joinPath(srcUri, "Test.elm").toString()}#L2>)`,
    );
  });

  it("links an inferred anonymous function parameter", async () => {
    const value = await testHover(
      `
--@ Test.elm
module Test exposing (..)
type Status = Ready
type Msg = Selected Status
select = \\status -> Selected status
                            --^
`,
      "status : Status",
      markdownCapabilities,
    );
    expect(value).toContain("[Go to Status]");
  });

  it.each([
    ["identity value = value", "value : a"],
    ["name person = person.firstname", "person : { a | firstname : b }"],
    ["broken : Missing -> Missing\nbroken value = value", "Local parameter"],
  ])(
    "keeps hover text for unresolved or unnamed types: %s",
    async (body, hint) => {
      const value = await testHover(
        `\n--@ Test.elm\nmodule Test exposing (..)\n${body}\n${" ".repeat((body.split("\n").at(-1) ?? "").lastIndexOf(" ") + 1)}--^\n`,
        hint,
        markdownCapabilities,
      );
      expect(value).not.toContain("[Go to");
    },
  );

  it("links a parameter at its declaration", async () => {
    const value = await testHover(
      parameterSource.replace(
        "getFirstname person =\n    person.firstname\n  --^",
        "getFirstname person =\n           --^\n    person.firstname",
      ),
      "person : Person",
      markdownCapabilities,
    );
    expect(value).toContain("[Go to Person]");
  });

  it("type should not have module prefix if it from the current module", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Foo = 
    String

foo : Foo
foo = ""

bar = foo
     --^
    `;

    await testHover(source, "foo : Foo");
  });

  it("should have module prefix if it is from the another module and the current module doesn't have one", async () => {
    const source = `
--@ Another.elm
module Another exposing (..)

type alias Foo = 
    String

foo : Foo
foo = ""

--@ Test.elm
module Test exposing (..)

import Another exposing (foo)

bar = foo
     --^
    `;

    await testHover(source, "foo : Another.Foo");
  });

  it("should have module prefix if it is from the another module and the current module has one already", async () => {
    const source = `
--@ Another.elm
module Another exposing (..)

type alias Foo = 
    String

foo : Foo
foo = ""

--@ Test.elm
module Test exposing (..)

import Another exposing (foo)

bar = foo
     --^
    `;

    await testHover(source, "foo : Another.Foo");
  });

  it("should have aliases module prefix if it from the another module", async () => {
    const source = `
--@ Another.elm
module Another exposing (..)

type alias Foo = 
    String

foo : Foo
foo = ""

--@ Test.elm
module Test exposing (..)

import Another as AnotherAlias exposing (foo)

bar = foo
     --^
    `;

    await testHover(source, "foo : AnotherAlias.Foo");
  });

  it("should include type alias field line comment in hover info", async () => {
    // IMPORTING MODULE
    const source = `
--@ Another.elm
module Another exposing (..)

type alias Foo =
    { bar: Int -- This is a comment explaining bar
    , biz: String -- This is a comment explaining biz
    }

--@ Test.elm
module Test exposing (..)

import Another exposing (Foo)


foo : Foo
foo = 
  { bar = 10
  , biz = "Hello World"
   --^
  }
    `;

    await testHover(
      source,
      "\n```elm\nbiz: String\n```\n\n\n---\n\nThis is a comment explaining biz\n\nField on the type alias `Foo`",
    );

    // IN SAME FILE
    const source2 = `
--@ Another.elm
module Another exposing (..)

type alias Foo =
    { bar: Int -- This is a comment explaining bar
     --^
    , biz: String -- This is a comment explaining biz
    }
     
    `;

    await testHover(
      source2,
      "\n```elm\nbar: Int\n```\n\n\n---\n\nThis is a comment explaining bar\n\nField on the type alias `Foo`",
    );
  });
});
