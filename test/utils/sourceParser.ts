import { Position } from "vscode-languageserver";

export function getCaretPositionFromSource(source: string): {
  position: Position;
  newSources: { [K: string]: string };
  fileWithCaret: string;
} {
  const sources = getSourceFiles(source);

  let position: Position | undefined;
  let fileWithCaret = "";

  for (const fileName in sources) {
    sources[fileName] = sources[fileName]
      .split("\n")
      .map((s, line) => {
        const character = s.search("{-caret-}");

        if (character >= 0) {
          position = { line, character };
          fileWithCaret = fileName;
        }

        return s.replace("{-caret-}", "");
      })
      .join("\n");
  }

  if (!position) {
    fail();
  }

  return { newSources: sources, position, fileWithCaret };
}

export type TestType =
  | IUnresolvedTest
  | IResolvedTest
  | IResolvesToDifferentFileTest;

interface IInvokeTest {
  sources: { [K: string]: string };
  invokePosition: Position;
  invokeFile: string;
}

interface IUnresolvedTest extends IInvokeTest {
  kind: "unresolved";
}
interface IResolvedTest extends IInvokeTest {
  kind: "resolves";
  targetPosition: Position;
}
interface IResolvesToDifferentFileTest extends IInvokeTest {
  kind: "resolvesToDifferentFile";
  targetFile: string;
  targetPosition?: Position;
}

interface IReferencesTest extends IInvokeTest {
  references: {
    referenceFile: string;
    referencePosition: Position;
  }[];
}

export function getInvokeAndTargetPositionFromSource(source: string): TestType {
  const sources = getSourceFiles(source);

  let unresolved;
  let invokePosition;
  let targetPosition;
  let targetFile;
  let invokeFile = "";

  for (const fileName in sources) {
    sources[fileName].split("\n").forEach((s, line) => {
      const invokeUnresolvedCharacter = s.search(/--(\^unresolved)/);
      const invokeFileCharacter = s.search(/--\^([A-Z][a-zA-Z0-9_/]*\.elm)/);
      const invokeCharacter = s.search(/--(\^)/);
      const targetCharacter = s.search(/--(X)/);
      const targetCharacter2 = s.search(/--<(X)/);

      // +2 is the offset for the --prefixing the ^
      if (invokeUnresolvedCharacter >= 0) {
        invokePosition = {
          line: line - 1,
          character: invokeUnresolvedCharacter + 2,
        };
        unresolved = true;

        invokeFile = fileName;
      } else if (invokeFileCharacter >= 0) {
        targetFile = /--\^([A-Z][a-zA-Z0-9_/]*\.elm)/.exec(s)?.[1];

        invokePosition = {
          line: line - 1,
          character: invokeFileCharacter + 2,
        };
        invokeFile = fileName;
      } else if (invokeCharacter >= 0) {
        invokePosition = {
          line: line - 1,
          character: invokeCharacter + 2,
        };
        invokeFile = fileName;
      }
      if (targetCharacter >= 0) {
        targetPosition = {
          line: line - 1,
          character: targetCharacter + 2,
        };
      } else if (targetCharacter2 >= 0) {
        targetPosition = {
          line: line - 1,
          character: targetCharacter,
        };
      }
    });
  }

  if (unresolved) {
    if (!invokePosition) {
      fail();
    }
    return {
      kind: "unresolved",
      invokePosition,
      sources,
      invokeFile,
    };
  } else if (targetFile) {
    if (!targetFile || !invokePosition) {
      fail();
    }
    return {
      kind: "resolvesToDifferentFile",
      invokePosition,
      sources,
      targetFile,
      invokeFile,
      targetPosition,
    };
  } else {
    if (!invokePosition || !targetPosition) {
      fail();
    }
    return {
      kind: "resolves",
      invokePosition,
      targetPosition,
      sources,
      invokeFile,
    };
  }
}

export function getTargetPositionFromSource(
  source: string,
): { position: Position; sources: { [K: string]: string } } | undefined {
  const sources = getSourceFiles(source);

  let position: Position | undefined;

  for (const fileName in sources) {
    sources[fileName].split("\n").forEach((s, line) => {
      const invokeCharacter = s.search(/--(\^)/);

      if (invokeCharacter >= 0) {
        position = {
          line: line - 1,
          character: invokeCharacter + 2,
        };
      }
    });
  }

  if (position) {
    return {
      position,
      sources,
    };
  }
}

export function getReferencesTestFromSource(
  source: string,
): IReferencesTest | undefined {
  const sources = getSourceFiles(source);

  let invokePosition: Position | undefined;
  let invokeFile = "";
  const references: {
    referenceFile: string;
    referencePosition: Position;
  }[] = [];

  for (const fileName in sources) {
    sources[fileName].split("\n").forEach((s, line) => {
      const invokeCharacter = s.search(/--(\^)/);

      if (invokeCharacter >= 0) {
        invokePosition = {
          line: line - 1,
          character: invokeCharacter + 2,
        };
        invokeFile = fileName;
      }

      const regex = new RegExp(/--(X)/, "g");

      let result: RegExpExecArray | null;
      do {
        result = regex.exec(s);
        const referenceCharacter = result?.index;
        if (referenceCharacter !== undefined && referenceCharacter >= 0) {
          references.push({
            referencePosition: {
              line: line - 1,
              character: referenceCharacter + 2,
            },
            referenceFile: fileName,
          });
        }
      } while (result);
    });
  }

  if (invokePosition) {
    return {
      invokeFile,
      invokePosition,
      sources,
      references,
    };
  }
}

export function getSourceFiles(source: string): { [K: string]: string } {
  const sources: { [K: string]: string } = {};
  let currentFile = "";
  const regex = /--@ ([a-zA-Z/]+.elm)/;

  const x = regex.exec(source);

  if (x == null || x[1] === undefined) {
    sources["Main.elm"] = source;
  } else {
    source.split("\n").forEach((s) => {
      const match = regex.exec(s);

      if (match !== null) {
        sources[match[1]] = "";
        currentFile = match[1];
      } else if (currentFile !== "") {
        sources[currentFile] = sources[currentFile] + s + "\n";
      }
    });
  }

  return sources;
}
