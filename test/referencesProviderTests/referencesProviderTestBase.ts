import { URI } from "vscode-uri";
import { ReferenceResult, ReferencesProvider } from "../../src/providers";
import { IReferenceParams } from "../../src/providers/paramsExtensions";
import { TreeUtils } from "../../src/util/treeUtils";
import { baseUri } from "../utils/mockElmWorkspace";
import { getReferencesTestFromSource } from "../utils/sourceParser";
import { SourceTreeParser } from "../utils/sourceTreeParser";

class MockReferencesProvider extends ReferencesProvider {
  public handleReference(params: IReferenceParams): ReferenceResult {
    return this.handleReferencesRequest(params);
  }
}

export class ReferencesProviderTestBase {
  private referencesProvider: MockReferencesProvider;
  private treeParser: SourceTreeParser;
  constructor() {
    this.referencesProvider = new MockReferencesProvider();
    this.treeParser = new SourceTreeParser();
  }

  public async testReferences(source: string): Promise<void> {
    await this.treeParser.init();

    const referenceTest = getReferencesTestFromSource(source);

    if (!referenceTest) {
      throw new Error("Getting references from source failed");
    }

    const testUri = URI.file(baseUri + referenceTest.invokeFile).toString();

    const program = this.treeParser.getWorkspace(referenceTest.sources);
    const sourceFile = program.getForest().getByUri(testUri);

    if (!sourceFile) throw new Error("Getting tree failed");

    const invokeUri = URI.file(baseUri + referenceTest.invokeFile).toString();

    const references =
      this.referencesProvider.handleReference({
        textDocument: {
          uri: invokeUri,
        },
        position: referenceTest.invokePosition,
        context: {
          includeDeclaration: true,
        },
        program,
        sourceFile,
      }) ?? [];

    // Add invoke position to references
    referenceTest.references.push({
      referenceFile: referenceTest.invokeFile,
      referencePosition: referenceTest.invokePosition,
    });

    expect(references.length).toEqual(referenceTest.references.length);

    referenceTest.references.forEach(({ referencePosition, referenceFile }) => {
      const referenceUri = URI.file(baseUri + referenceFile).toString();

      const rootNode = program.getSourceFile(referenceUri).tree.rootNode;
      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        rootNode,
        referencePosition,
      );

      const foundReference = references.find(
        (ref) =>
          ref.uri === referenceUri &&
          ref.range.start.line === referencePosition.line &&
          ref.range.start.character === nodeAtPosition.startPosition.column,
      );

      if (!foundReference) {
        console.log(referenceUri);
        console.log(referencePosition);
      }

      expect(foundReference).toBeTruthy();
    });
  }
}
