import { Location } from "vscode-languageserver";
import { Utils as UriUtils } from "vscode-uri";
import { TypeDefinitionProvider } from "../src/common/providers/typeDefinitionProvider.js";
import { ITextDocumentPositionParams } from "../src/common/providers/paramsExtensions.js";
import { getCaretPositionFromSource } from "./utils/sourceParser.js";
import { SourceTreeParser, srcUri } from "./utils/sourceTreeParser.js";

class TestTypeDefinitionProvider extends TypeDefinitionProvider {
  public handleTypeDefinition(
    params: ITextDocumentPositionParams,
  ): Location | undefined {
    return this.handleTypeDefinitionRequest(params);
  }
}

describe("TypeDefinitionProvider", () => {
  const treeParser = new SourceTreeParser();
  const provider = new TestTypeDefinitionProvider();

  async function getTypeDefinition(source: string): Promise<{
    location: Location | undefined;
    program: Awaited<ReturnType<SourceTreeParser["getProgram"]>>;
  }> {
    await treeParser.init();
    const { newSources, position, fileWithCaret } =
      getCaretPositionFromSource(source);
    const program = await treeParser.getProgram(newSources);
    const uri = UriUtils.joinPath(srcUri, fileWithCaret).toString();
    const sourceFile = program.getSourceFile(uri);
    if (!sourceFile) {
      throw new Error("Getting tree failed");
    }

    return {
      location: provider.handleTypeDefinition({
        textDocument: { uri },
        position,
        program,
        sourceFile,
      }),
      program,
    };
  }

  it("resolves an inferred local union type", async () => {
    const { location, program } = await getTypeDefinition(`
--@ Main.elm
module Main exposing (..)

type Status = Ready

status = Ready
view = {-caret-}status
`);
    const declaration = program
      .getSourceFile(UriUtils.joinPath(srcUri, "Main.elm").toString())
      ?.tree.rootNode.descendantsOfType("type_declaration")[0];

    expect(location?.uri).toContain("Main.elm");
    expect(location?.range.start.line).toBe(declaration?.startPosition.row);
  });

  it("resolves an inferred imported union type", async () => {
    const { location } = await getTypeDefinition(`
--@ Models.elm
module Models exposing (Status(..))

type Status = Ready

--@ Main.elm
module Main exposing (..)

import Models exposing (Status(..))

status = Ready
view = {-caret-}status
`);

    expect(location?.uri).toContain("Models.elm");
  });

  it("resolves an inferred imported alias", async () => {
    const { location, program } = await getTypeDefinition(`
--@ Models.elm
module Models exposing (Box, box)

type Status = Ready
type alias Box = { value : Status }

box : Box
box = { value = Ready }

--@ Main.elm
module Main exposing (..)

import Models exposing (box)

view = {-caret-}box
`);
    const declaration = program
      .getSourceFile(UriUtils.joinPath(srcUri, "Models.elm").toString())
      ?.tree.rootNode.descendantsOfType("type_alias_declaration")[0];

    expect(location).toEqual({
      uri: UriUtils.joinPath(srcUri, "Models.elm").toString(),
      range: {
        start: {
          line: declaration?.startPosition.row,
          character: declaration?.startPosition.column,
        },
        end: {
          line: declaration?.endPosition.row,
          character: declaration?.endPosition.column,
        },
      },
    });
  });

  it("prefers an alias over its underlying union type", async () => {
    const { location, program } = await getTypeDefinition(`
--@ Main.elm
module Main exposing (..)

type Status = Ready
type alias CurrentStatus = Status

status : CurrentStatus
status = Ready
view = {-caret-}status
`);
    const declaration = program
      .getSourceFile(UriUtils.joinPath(srcUri, "Main.elm").toString())
      ?.tree.rootNode.descendantsOfType("type_alias_declaration")[0];

    expect(location?.range.start.line).toBe(declaration?.startPosition.row);
  });

  it("does not resolve anonymous record types", async () => {
    const { location } = await getTypeDefinition(`
--@ Main.elm
module Main exposing (..)

type Status = Ready
status = { value = Ready }
view = {-caret-}status
`);

    expect(location).toBeUndefined();
  });

  it("does not resolve generic type variables", async () => {
    const { location } = await getTypeDefinition(`
--@ Main.elm
module Main exposing (..)

identity value = {-caret-}value
`);

    expect(location).toBeUndefined();
  });
});
