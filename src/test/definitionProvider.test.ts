import { DefinitionProvider, DefinitionResult } from "../providers";
import {
  IConnection,
  Location,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { IElmWorkspace } from "../elmWorkspace";
import { SourceTreeParser } from "./utils/sourceTreeParser";
import { mockUri } from "./utils/mockElmWorkspace";
import { Position } from "vscode-languageserver-textdocument";
import { mockDeep } from "jest-mock-extended";
import { TreeUtils } from "../util/treeUtils";
import { getInvokeAndTargetPositionFromSource } from "./utils/sourceParser";

class MockDefinitionProvider extends DefinitionProvider {
  public handleDefinition(
    params: TextDocumentPositionParams,
    elmWorkspace: IElmWorkspace,
  ): DefinitionResult {
    return this.handleDefinitionRequest(params, elmWorkspace);
  }
}

describe("DefinitionProvider", () => {
  const connectionMock = mockDeep<IConnection>();

  const definitionProvider = new MockDefinitionProvider(connectionMock, []);
  const treeParser = new SourceTreeParser();

  async function testDefinition(source: string) {
    await treeParser.init();

    const {
      newSource,
      invokePosition,
      targetPosition,
      unresolved,
    } = getInvokeAndTargetPositionFromSource(source);

    // Add the module header and account for it in the cursor position
    const sources = ["module Test exposing (..)", "", ...newSource.split("\n")];
    if (unresolved) {
      if (!invokePosition) {
        fail();
      }

      invokePosition.line += 2;

      const definition = definitionProvider.handleDefinition(
        {
          textDocument: { uri: mockUri },
          position: invokePosition!,
        },
        treeParser.getWorkspace(sources),
      );

      expect(definition).toEqual(undefined);
    } else {
      if (!invokePosition || !targetPosition) {
        fail();
      }

      invokePosition.line += 2;
      targetPosition.line += 2;

      const definition = definitionProvider.handleDefinition(
        {
          textDocument: { uri: mockUri },
          position: invokePosition!,
        },
        treeParser.getWorkspace(sources),
      );

      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        treeParser
          .getWorkspace(sources)
          .getForest()
          .treeIndex.find((a) => a.uri === mockUri)!.tree.rootNode,
        targetPosition,
      );

      expect(definition).toEqual(
        expect.objectContaining({
          uri: mockUri,
          range: {
            start: {
              line: targetPosition.line,
              character: nodeAtPosition.startPosition.column,
            },
            end: {
              line: expect.any(Number),
              character: expect.any(Number),
            },
          },
        }),
      );
    }
  }

  it("test field access ref", async () => {
    const source = `
foo : { b : String }
foo a = a.b
  --X --^
`;
    await testDefinition(source);
  });

  it(`test function name ref`, async () => {
    const source = `
addOne x = x + 1
--X
f = addOne 42
    --^
`;
    await testDefinition(source);
  });

  it(`test function parameter ref`, async () => {
    const source = `
foo x y =  x + y
    --X      --^
`;
    await testDefinition(source);
  });

  it(`test type annotation refers to function name decl`, async () => {
    const source = `
addOne : Int -> Int
--^
addOne x = x + 1
--X
`;
    await testDefinition(source);
  });

  it(`test nested function parameter ref`, async () => {
    const source = `
f x =
    let scale y = 100 * y
            --X       --^
    in x
`;
    await testDefinition(source);
  });

  it(`test deep lexical scope of function parameters`, async () => {
    const source = `
f x =
--X
    let
        y =
            let
                z = x + 1
                  --^
            in z
    in y
`;
    await testDefinition(source);
  });

  xit(`test name shadowing basic`, async () => {
    const source = `
f x =
    let x = 42
      --X
    in x
     --^
`;
    await testDefinition(source);
  });

  xit(`test name shadowing within let-in decls`, async () => {
    const source = `
f x =
    let
        x = 42
      --X
        y = x + 1
          --^
    in
        x
`;
    await testDefinition(source);
  });

  it(`test recursive function ref`, async () => {
    const source = `
foo x =
--X
    if x <= 0 then 0 else foo (x - 1)
                          --^
`;
    await testDefinition(source);
  });

  it(`test nested recursive function ref`, async () => {
    const source = `
foo =
    let
        bar y = if y <= 0 then 0 else bar (y - 1)
        --X                           --^
    in bar 100
`;
    await testDefinition(source);
  });

  it(`test unresolved ref to function`, async () => {
    const source = `
f x = g x
    --^unresolved
`;
    await testDefinition(source);
  });

  it(`test unresolved ref to function parameter`, async () => {
    const source = `
f x = x
g y = x
    --^unresolved
`;
    await testDefinition(source);
  });

  it(`test type annotation name ref`, async () => {
    const source = `
foo : Int -> Int
--^
foo a = a
--X
outer =
    let
        foo a = a
    in foo
`;
    await testDefinition(source);
  });

  xit(`test nested type annotation name ref`, async () => {
    const source = `
foo a = a
outer =
    let
        foo : Int -> Int
        --^
        foo a = a
        --X
    in foo
`;
    await testDefinition(source);
  });
});
