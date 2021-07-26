import path from "path";
import { URI } from "vscode-uri";
import { ReferenceResult, ReferencesProvider } from "../../src/providers.js";
import { IReferenceParams } from "../../src/providers/paramsExtensions.js";
import { TreeUtils } from "../../src/util/treeUtils.js";
import { getReferencesTestFromSource } from "../utils/sourceParser.js";
import { SourceTreeParser, srcUri } from "../utils/sourceTreeParser.js";

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

    const testUri = URI.file(
      path.join(srcUri, referenceTest.invokeFile),
    ).toString();

    const program = await this.treeParser.getProgram(referenceTest.sources);
    const sourceFile = program.getForest().getByUri(testUri);

    if (!sourceFile) throw new Error("Getting tree failed");

    const invokeUri = URI.file(
      path.join(srcUri, referenceTest.invokeFile),
    ).toString();

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

    if (references.length !== referenceTest.references.length) {
      console.log(
        `Expected\n${JSON.stringify(
          references,
          null,
          2,
        )}\nto equal\n${JSON.stringify(referenceTest.references, null, 2)}`,
      );
    }

    expect(references.length).toEqual(referenceTest.references.length);

    referenceTest.references.forEach(({ referencePosition, referenceFile }) => {
      const referenceUri = URI.file(
        path.join(srcUri, referenceFile),
      ).toString();

      const rootNode = program.getSourceFile(referenceUri)!.tree.rootNode;
      let nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        rootNode,
        referencePosition,
      );

      nodeAtPosition =
        nodeAtPosition?.parent?.type == "upper_case_qid"
          ? nodeAtPosition.parent
          : nodeAtPosition;

      const foundReference = references.find(
        (ref) =>
          ref.uri === referenceUri &&
          ref.range.start.line === referencePosition.line &&
          ref.range.start.character === nodeAtPosition.startPosition.column,
      );

      if (!foundReference) {
        console.log(referenceUri);
        console.log(referencePosition);
        console.log(
          `Missing reference in ${JSON.stringify(references, null, 2)}`,
        );
      }

      expect(foundReference).toBeTruthy();
    });
  }
}
