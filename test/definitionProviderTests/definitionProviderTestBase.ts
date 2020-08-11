import { DefinitionProvider, DefinitionResult } from "../../src/providers";
import {
  IConnection,
  TextDocumentPositionParams,
  Location,
} from "vscode-languageserver";
import { IElmWorkspace } from "../../src/elmWorkspace";
import { SourceTreeParser } from "../utils/sourceTreeParser";
import { baseUri } from "../utils/mockElmWorkspace";
import { mockDeep } from "jest-mock-extended";
import { TreeUtils } from "../../src/util/treeUtils";
import { getInvokeAndTargetPositionFromSource } from "../utils/sourceParser";
import { URI } from "vscode-uri";

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
    const targetUri = URI.file(
      baseUri + determinedTestType.fileWithTarget,
    ).toString();

    switch (determinedTestType.kind) {
      case "unresolved":
        {
          const definition = this.definitionProvider.handleDefinition(
            {
              textDocument: {
                uri: targetUri,
              },
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
              textDocument: {
                uri: targetUri,
              },
              position: determinedTestType.invokePosition,
            },
            this.treeParser.getWorkspace(determinedTestType.sources),
          );

          expect(definition).toBeDefined();
          expect((definition as Location).uri).toContain(
            determinedTestType.targetFile,
          );

          if (determinedTestType.targetPosition) {
            const rootNode = this.treeParser
              .getWorkspace(determinedTestType.sources)
              .getForest()
              .treeIndex.find((a) => a.uri === targetUri)!.tree.rootNode;
            const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
              rootNode,
              determinedTestType.targetPosition,
            );

            expect((definition as Location).range).toEqual(
              expect.objectContaining({
                start: {
                  line: determinedTestType.targetPosition.line,
                  character: nodeAtPosition.startPosition.column,
                },
                end: {
                  line: expect.any(Number),
                  character: expect.any(Number),
                },
              }),
            );
          }
        }
        break;

      case "resolves":
        {
          const definition = this.definitionProvider.handleDefinition(
            {
              textDocument: {
                uri: targetUri,
              },
              position: determinedTestType.invokePosition,
            },
            this.treeParser.getWorkspace(determinedTestType.sources),
          );

          const rootNode = this.treeParser
            .getWorkspace(determinedTestType.sources)
            .getForest()
            .treeIndex.find((a) => a.uri === targetUri)!.tree.rootNode;
          const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
            rootNode,
            determinedTestType.targetPosition,
          );

          expect(definition).toEqual(
            expect.objectContaining({
              uri: targetUri,
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
