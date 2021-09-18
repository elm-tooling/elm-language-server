import path from "path";
import { URI } from "vscode-uri";
import { createNodeProgramHost, createProgram } from "../src/compiler/program";

async function run(): Promise<void> {
  const host = createNodeProgramHost();
  host.logger = console;

  const rootUri = URI.parse(path.join(__dirname, "../../../elm-engage-common"));
  const program = await createProgram(rootUri, host);

  const checker = program.getTypeChecker();
  program.getSourceFiles().forEach((sourceFile) => {
    if (sourceFile.writeable) {
      sourceFile.tree.rootNode.children.forEach((node) => {
        if (node.type === "value_declaration") {
          const type = checker.findType(node);
          console.log(checker.typeToString(type));
        }
      });
    }
  });
}

void run();
