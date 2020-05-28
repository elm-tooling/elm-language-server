import { DefinitionProvider, DefinitionResult } from "../../providers";
import { IConnection, TextDocumentPositionParams } from "vscode-languageserver";
import { IElmWorkspace } from "../../elmWorkspace";
import { SourceTreeParser } from "../utils/sourceTreeParser";
import { baseUri } from "../utils/mockElmWorkspace";
import { mockDeep } from "jest-mock-extended";
import { TreeUtils } from "../../util/treeUtils";
import { getInvokeAndTargetPositionFromSource } from "../utils/sourceParser";
import { URI } from "vscode-uri";

const mockUri = URI.file(baseUri + "Main.elm").toString();

class MockDefinitionProvider extends DefinitionProvider {
  public handleDefinition(
    params: TextDocumentPositionParams,
    elmWorkspace: IElmWorkspace,
  ): DefinitionResult {
    return this.handleDefinitionRequest(params, elmWorkspace);
  }
}

export class DefinitionProviderTestBase {
  private connectionMock: IConnection;
  private definitionProvider: MockDefinitionProvider;
  private treeParser: SourceTreeParser;
  constructor() {
    this.connectionMock = mockDeep<IConnection>();

    this.definitionProvider = new MockDefinitionProvider(
      this.connectionMock,
      [],
    );
    this.treeParser = new SourceTreeParser();
  }

  public async testDefinition(source: string): Promise<void> {
    await this.treeParser.init();

    const determinedTestType = getInvokeAndTargetPositionFromSource(source);

    switch (determinedTestType.kind) {
      case "unresolved":
        {
          const definition = this.definitionProvider.handleDefinition(
            {
              textDocument: { uri: mockUri },
              position: determinedTestType.invokePosition,
            },
            this.treeParser.getWorkspace(determinedTestType.sources),
          );

          expect(definition).toEqual(undefined);
        }
        break;

      case "resolvesToDifferentFile":
        {
          const definition = this.definitionProvider.handleDefinition(
            {
              textDocument: { uri: mockUri },
              position: determinedTestType.invokePosition,
            },
            this.treeParser.getWorkspace(determinedTestType.sources),
          );

          expect(definition).toEqual(undefined);
        }
        break;

      case "resolves":
        {
          const definition = this.definitionProvider.handleDefinition(
            {
              textDocument: { uri: mockUri },
              position: determinedTestType.invokePosition,
            },
            this.treeParser.getWorkspace(determinedTestType.sources),
          );

          const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
            this.treeParser
              .getWorkspace(determinedTestType.sources)
              .getForest()
              .treeIndex.find((a) => a.uri === mockUri)!.tree.rootNode,
            determinedTestType.targetPosition,
          );

          expect(definition).toEqual(
            expect.objectContaining({
              uri: mockUri,
              range: {
                start: {
                  line: determinedTestType.targetPosition.line,
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
        break;

      default:
        break;
    }
  }
}
