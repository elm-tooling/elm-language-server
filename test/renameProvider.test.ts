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
import * as path from "../src/util/path";
import { getTargetPositionFromSource } from "./utils/sourceParser";
import { baseUri, SourceTreeParser } from "./utils/sourceTreeParser";

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
    expectedEdits: TextEdit[][],
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

    const renameEdit = renameProvider.onRenameRequest({
      program,
      sourceFile,
      position: result.position,
      textDocument: { uri: testUri },
      newName,
    });

    const changes = Object.keys(result.sources).reduce<{
      [uri: string]: TextEdit[];
    }>((prev, cur, index) => {
      prev[URI.file(path.join(baseUri, cur)).toString()] = expectedEdits[index];
      return prev;
    }, {});

    expect(renameEdit?.changes).toEqual(changes);
  }

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

    const renameRange = Range.create(
      Position.create(4, 18),
      Position.create(4, 21),
    );
    await testPrepareRename(source, renameRange);

    const newName = "bar";
    await testRename(source, newName, [
      [TextEdit.replace(renameRange, newName)],
      [
        TextEdit.replace(
          Range.create(Position.create(2, 0), Position.create(2, 3)),
          newName,
        ),
        TextEdit.replace(
          Range.create(Position.create(0, 28), Position.create(0, 31)),
          newName,
        ),
      ],
    ]);
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

    const renameRange = Range.create(
      Position.create(4, 7),
      Position.create(4, 17),
    );

    const newName = "Module.NewApp";
    const expectedEdits = [
      [
        TextEdit.replace(
          Range.create(Position.create(2, 7), Position.create(2, 17)),
          newName,
        ),
        TextEdit.replace(renameRange, newName),
      ],
      [
        TextEdit.replace(
          Range.create(Position.create(0, 7), Position.create(0, 17)),
          newName,
        ),
      ],
    ];

    await testPrepareRename(source, renameRange);
    await testRename(source, newName, expectedEdits);

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
    await testRename(source2, newName, expectedEdits);
  });
});
