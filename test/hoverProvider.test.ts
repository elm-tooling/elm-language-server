import path from "path";
import { MarkupContent } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { HoverProvider, HoverResult } from "../src/providers";
import { ITextDocumentPositionParams } from "../src/providers/paramsExtensions";
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

    const testUri = URI.file(
      path.join(invokeFile.startsWith("tests") ? baseUri : srcUri, invokeFile),
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
});
