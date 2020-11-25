import { ReferenceParams } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { IElmWorkspace } from "../../src/elmWorkspace";
import { ReferenceResult, ReferencesProvider } from "../../src/providers";
import { TreeUtils } from "../../src/util/treeUtils";
import { baseUri } from "../utils/mockElmWorkspace";
import { getReferencesTestFromSource } from "../utils/sourceParser";
import { SourceTreeParser } from "../utils/sourceTreeParser";

class MockReferencesProvider extends ReferencesProvider {
  public handleReference(
    params: ReferenceParams,
    elmWorkspace: IElmWorkspace,
  ): ReferenceResult {
    return this.handleReferencesRequest(params, elmWorkspace);
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
      fail();
    }

    const invokeUri = URI.file(baseUri + referenceTest.invokeFile).toString();

    const workspace = this.treeParser.getWorkspace(referenceTest.sources);
    const references =
      this.referencesProvider.handleReference(
        {
          textDocument: {
            uri: invokeUri,
          },
          position: referenceTest.invokePosition,
          context: {
            includeDeclaration: true,
          },
        },
        workspace,
      ) ?? [];

    // Add invoke position to references
    referenceTest.references.push({
      referenceFile: referenceTest.invokeFile,
      referencePosition: referenceTest.invokePosition,
    });

    expect(references.length).toEqual(referenceTest.references.length);

    referenceTest.references.forEach(({ referencePosition, referenceFile }) => {
      const referenceUri = URI.file(baseUri + referenceFile).toString();

      const rootNode = workspace.getForest().treeMap.get(referenceUri)!.tree
        .rootNode;
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
