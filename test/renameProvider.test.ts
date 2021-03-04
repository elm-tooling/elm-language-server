import {
  TextEdit,
  WorkspaceEdit,
  Range,
  Position,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { RenameProvider } from "../src/providers";
import {
  IPrepareRenameParams,
  IRenameParams,
} from "../src/providers/paramsExtensions";
import {
  getSourceFiles,
  getTargetPositionFromSource,
} from "./utils/sourceParser";
import {
  applyEditsToSource,
  baseUri,
  SourceTreeParser,
  stripCommentLines,
  trimTrailingWhitespace,
} from "./utils/sourceTreeParser";

class MockRenameProvider extends RenameProvider {
  public onPrepareRenameRequest(params: IPrepareRenameParams): Range | null {
    return this.handlePrepareRenameRequest(params);
  }

  public onRenameRequest(
    params: IRenameParams,
  ): WorkspaceEdit | null | undefined {
    return this.handleRenameRequest(params);
  }
}

describe("renameProvider", () => {
  const treeParser = new SourceTreeParser();
  const renameProvider = new MockRenameProvider();

  async function testPrepareRename(
    source: string,
    expectedRange: Range,
  ): Promise<void> {
    await treeParser.init();

    const testUri = URI.file(baseUri + "Test.elm").toString();
    const result = getTargetPositionFromSource(source);

    if (!result) {
      throw new Error("Could not get sources");
    }

    const program = await treeParser.getProgram(result.sources);

    const sourceFile = program.getSourceFile(testUri);

    if (!sourceFile) {
      throw new Error("Could not get source file");
    }

    const renameRange = renameProvider.onPrepareRenameRequest({
      program,
      sourceFile,
      position: result.position,
      textDocument: { uri: testUri },
    });

    expect(renameRange).toEqual(expectedRange);
  }

  async function testRename(
    source: string,
    newName: string,
    expectedResult: string,
  ): Promise<void> {
    await treeParser.init();

    const testUri = URI.file(baseUri + "Test.elm").toString();
    const result = getTargetPositionFromSource(trimTrailingWhitespace(source));

    if (!result) {
      throw new Error("Could not get sources");
    }

    const program = await treeParser.getProgram(result.sources);

    const sourceFile = program.getSourceFile(testUri);

    if (!sourceFile) {
      throw new Error("Could not get source file");
    }

    const renameEdit = renameProvider.onRenameRequest({
      program,
      sourceFile,
      position: result.position,
      textDocument: { uri: testUri },
      newName,
    });

    if (!renameEdit?.changes) {
      fail();
    }

    const expectedSources = getSourceFiles(
      trimTrailingWhitespace(expectedResult),
    );

    Object.entries(result.sources).forEach(([uri, source]) => {
      expect(
        applyEditsToSource(
          stripCommentLines(source),
          renameEdit.changes![URI.file(baseUri + uri).toString()] ?? [],
        ),
      ).toEqual(expectedSources[uri]);
    });
  }

  it("renaming a function", async () => {
    const source = `
--@ Test.elm
module Test exposing (func)

func a =
--^
    15

--@ Module/App.elm
module Module.App exposing (foo)

import Test exposing (func)

foo : a -> Int
foo =
    func
`;

    const expectedResult = `
--@ Test.elm
module Test exposing (bar)

bar a =
    15

--@ Module/App.elm
module Module.App exposing (foo)

import Test exposing (bar)

foo : a -> Int
foo =
    bar
`;

    const renameRange = Range.create(
      Position.create(2, 0),
      Position.create(2, 4),
    );
    await testPrepareRename(source, renameRange);
    await testRename(source, "bar", expectedResult);
  });

  it("renaming a qualified value function part", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Module.App

func = Module.App.foo
                 --^

--@ Module/App.elm
module Module.App exposing (foo)

foo = ""
`;

    const expectedResult = `
--@ Test.elm
module Test exposing (..)

import Module.App

func = Module.App.bar

--@ Module/App.elm
module Module.App exposing (bar)

bar = ""
`;

    const renameRange = Range.create(
      Position.create(4, 18),
      Position.create(4, 21),
    );
    await testPrepareRename(source, renameRange);
    await testRename(source, "bar", expectedResult);
  });

  it("renaming a qualified value module part", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Module.App

func = Module.App.foo
             --^

--@ Module/App.elm
module Module.App exposing (foo)

foo = ""
`;

    const expectedResult = `
--@ Test.elm
module Test exposing (..)

import Module.NewApp

func = Module.NewApp.foo

--@ Module/App.elm
module Module.NewApp exposing (foo)

foo = ""
    `;

    const renameRange = Range.create(
      Position.create(4, 7),
      Position.create(4, 17),
    );

    await testPrepareRename(source, renameRange);
    await testRename(source, "Module.NewApp", expectedResult);

    const source2 = `
--@ Test.elm
module Test exposing (..)

import Module.App

func = Module.App.foo
        --^

--@ Module/App.elm
module Module.App exposing (foo)

foo = ""
`;

    await testPrepareRename(source2, renameRange);
    await testRename(source2, "Module.NewApp", expectedResult);
  });

  it("renaming a type alias", async () => {
    const source = `
--@ Test.elm
module Test exposing (Type, t)

type alias Type =
    { tag : String
    , data : Int
    }

t : Type
  --^
t =
    {}

--@ Module/App.elm
module Module.App exposing (foo)

import Test exposing (Type)

foo : Type
foo = {}
`;

    const expectedResult = `
--@ Test.elm
module Test exposing (NewType, t)

type alias NewType =
    { tag : String
    , data : Int
    }

t : NewType
t =
    {}

--@ Module/App.elm
module Module.App exposing (foo)

import Test exposing (NewType)

foo : NewType
foo = {}
    `;

    const renameRange = Range.create(
      Position.create(7, 4),
      Position.create(7, 8),
    );

    await testPrepareRename(source, renameRange);
    await testRename(source, "NewType", expectedResult);
  });

  it("renaming a type union constructor", async () => {
    const source = `
--@ Test.elm
module Test exposing (State(..), t)

type State
    = Ok
    | Average
    | Bad

t : State
t =
    Ok
  --^

--@ Module/App.elm
module Module.App exposing (foo)

import Test exposing (State(..))


foo : State
foo =
    Ok
`;

    const expectedResult = `
--@ Test.elm
module Test exposing (State(..), t)

type State
    = NotOkay
    | Average
    | Bad

t : State
t =
    NotOkay

--@ Module/App.elm
module Module.App exposing (foo)

import Test exposing (State(..))


foo : State
foo =
    NotOkay
    `;

    const renameRange = Range.create(
      Position.create(9, 4),
      Position.create(9, 6),
    );

    await testPrepareRename(source, renameRange);
    await testRename(source, "NotOkay", expectedResult);
  });
});
