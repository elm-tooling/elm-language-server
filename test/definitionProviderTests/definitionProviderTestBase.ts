import { Location, TextDocumentPositionParams } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { IElmWorkspace } from "../../src/elmWorkspace";
import { DefinitionProvider, DefinitionResult } from "../../src/providers";
import { TreeUtils } from "../../src/util/treeUtils";
import { baseUri } from "../utils/mockElmWorkspace";
import { getInvokeAndTargetPositionFromSource } from "../utils/sourceParser";
import { SourceTreeParser } from "../utils/sourceTreeParser";

class MockDefinitionProvider extends DefinitionProvider {
  public handleDefinition(
    params: TextDocumentPositionParams,
    elmWorkspace: IElmWorkspace,
  ): DefinitionResult {
    return this.handleDefinitionRequest(params, elmWorkspace);
  }
}

export class DefinitionProviderTestBase {
  private definitionProvider: MockDefinitionProvider;
  private treeParser: SourceTreeParser;
  constructor() {
    this.definitionProvider = new MockDefinitionProvider();
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
