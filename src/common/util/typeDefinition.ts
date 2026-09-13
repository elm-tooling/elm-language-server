import { ISymbol } from "../../compiler/binder.js";
import { ISourceFile } from "../../compiler/forest.js";
import { IProgram } from "../../compiler/program.js";
import { Type } from "../../compiler/typeInference.js";

/** Resolve a named inferred type, preferring its alias over the underlying type. */
export function findTypeDefinition(
  type: Type,
  sourceFile: ISourceFile,
  program: IProgram,
): ISymbol | undefined {
  const namedType =
    type.alias ??
    (type.nodeType === "Union"
      ? { module: type.module, name: type.name }
      : undefined);

  if (!namedType) {
    return;
  }

  const typeSourceFile = program.getSourceFileOfImportableModule(
    sourceFile,
    namedType.module,
  );
  return typeSourceFile?.symbolLinks
    ?.get(typeSourceFile.tree.rootNode)
    ?.get(
      namedType.name,
      (symbol) => symbol.type === "Type" || symbol.type === "TypeAlias",
    );
}
