import path from "path";
import { MarkupContent } from "vscode-languageserver";
import { URI, Utils } from "vscode-uri";
import { HoverProvider, HoverResult } from "../src/common/providers";
import { ITextDocumentPositionParams } from "../src/common/providers/paramsExtensions";
import { getInvokePositionFromSource } from "./utils/sourceParser";
import { baseUri, SourceTreeParser, srcUri } from "./utils/sourceTreeParser";

class MockHoverProvider extends HoverProvider {
  handleHover = (params: ITextDocumentPositionParams): HoverResult => {
    return this.handleHoverRequest(params);
  };
}

describe("HoverProvider", () => {
  const treeParser = new SourceTreeParser();

  async function testHover(source: string, expectContains: string) {
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
    } else {
      expect(MarkupContent.is(hover.contents)).toBeTruthy();
    }
  }

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
