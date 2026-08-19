import { Location } from "vscode-languageserver";
import { Utils } from "vscode-uri";
import {
  DefinitionProvider,
  DefinitionResult,
} from "../../src/common/providers/index.js";
import { ITextDocumentPositionParams } from "../../src/common/providers/paramsExtensions.js";
import { TreeUtils } from "../../src/common/util/treeUtils.js";
import { getInvokeAndTargetPositionFromSource } from "../utils/sourceParser.js";
import { SourceTreeParser, srcUri } from "../utils/sourceTreeParser.js";

class MockDefinitionProvider extends DefinitionProvider {
  public handleDefinition(
    params: ITextDocumentPositionParams,
  ): DefinitionResult {
    return this.handleDefinitionRequest(params);
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
    const invokeUri = Utils.joinPath(
      srcUri,
      determinedTestType.invokeFile,
    ).toString();

    const program = await this.treeParser.getProgram(
      determinedTestType.sources,
    );
    const sourceFile = program.getSourceFile(invokeUri);

    if (!sourceFile) throw new Error("Getting tree failed");

    switch (determinedTestType.kind) {
      case "unresolved":
        {
          const definition = this.definitionProvider.handleDefinition({
            textDocument: {
              uri: invokeUri,
            },
            position: determinedTestType.invokePosition,
            program,
            sourceFile,
          });

          expect(definition).toEqual(undefined);
        }
        break;

      case "resolvesToDifferentFile":
        {
          const definition = this.definitionProvider.handleDefinition({
            textDocument: {
              uri: invokeUri,
            },
            position: determinedTestType.invokePosition,
            program,
            sourceFile,
          });

          expect(definition).toBeDefined();
          expect((definition as Location).uri).toContain(
            determinedTestType.targetFile,
          );

          if (determinedTestType.targetPosition) {
            const targetUri = Utils.joinPath(
              srcUri,
              determinedTestType.targetFile,
            ).toString();

            const rootNode = program.getSourceFile(targetUri)!.tree.rootNode;
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
          const definition = this.definitionProvider.handleDefinition({
            textDocument: {
              uri: invokeUri,
            },
            position: determinedTestType.invokePosition,
            program,
            sourceFile,
          });

          const rootNode = program.getSourceFile(invokeUri)!.tree.rootNode;
          const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
            rootNode,
            determinedTestType.targetPosition,
          );

          expect(definition).toEqual(
            expect.objectContaining({
              uri: invokeUri,
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
