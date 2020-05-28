import { Position } from "vscode-languageserver";

export function getCaretPositionFromSource(
  source: string[],
): { position: Position; newSources: { [K: string]: string } } {
  let tempSource = source;
  let tempPosition: Position | undefined = undefined;

  source.forEach((s, line) => {
    const character = s.search("{-caret-}");
    tempSource[line] = s.replace("{-caret-}", "");

    if (character >= 0) {
      tempPosition = { line, character };
    }
  });

  if (!tempPosition) {
    fail();
  }

  tempSource = ["module Test exposing (..)", "", ...tempSource];

  (tempPosition as Position).line += 2;

  const result: {
    newSources: { [K: string]: string };
    position: Position;
  } = { newSources: {}, position: tempPosition };
  result.newSources["Main.elm"] = tempSource.join("\n");
  return result;
}

export type TestType =
  | IUnresolvedTest
  | IResolvedTest
  | IResolvesToDifferentFileTest;

interface IUnresolvedTest {
  kind: "unresolved";
  invokePosition: Position;
  sources: { [K: string]: string };
}
interface IResolvedTest {
  kind: "resolves";
  invokePosition: Position;
  targetPosition: Position;
  sources: { [K: string]: string };
}
interface IResolvesToDifferentFileTest {
  kind: "resolvesToDifferentFile";
  invokePosition: Position;
  targetFile: string;
  sources: { [K: string]: string };
}

export function getInvokeAndTargetPositionFromSource(source: string): TestType {
  let unresolved;
  let invokePosition;
  let targetPosition;
  let targetFile;
  source.split("\n").forEach((s, line) => {
    const invokeUnresolvedCharacter = s.search(/--(\^unresolved)/);
    const invokeFileCharacter = s.search(/--\^([A-Z][a-zA-Z0-9_]*\.elm)/);
    const invokeCharacter = s.search(/--(\^)/);
    const targetCharacter = s.search(/--(X)/);

    // +2 is the offset for the --prefixing the ^
    if (invokeUnresolvedCharacter >= 0) {
      invokePosition = {
        line: line - 1,
        character: invokeUnresolvedCharacter + 2,
      };
      unresolved = true;
    } else if (invokeFileCharacter >= 0) {
      targetFile = /--\^([A-Z][a-zA-Z0-9_]*\.elm)/.exec(s)?.[1];

      invokePosition = {
        line: line - 1,
        character: invokeFileCharacter + 2,
      };
    } else if (invokeCharacter >= 0) {
      invokePosition = {
        line: line - 1,
        character: invokeCharacter + 2,
      };
    }
    if (targetCharacter >= 0) {
      targetPosition = {
        line: line - 1,
        character: targetCharacter + 2,
      };
    }
  });

  const sources: { [K: string]: string } = {};
  let currentFile = "";
  const regex = /^--@ ([a-zA-Z]+.elm)$/;

  const x = regex.exec(source);

  if (x == null || x[1] === undefined) {
    sources["Main.elm"] = source;
  } else {
    source.split("\n").forEach((s, line) => {
      const match = regex.exec(s);

      if (match !== null) {
        sources[match[1]] = "";
        currentFile = match[1];
      } else {
        sources[currentFile] = sources[currentFile] + s + "\n";
      }
    });
  }

  if (unresolved) {
    if (!invokePosition) {
      fail();
    }
    return { kind: "unresolved", invokePosition, sources };
  } else if (targetFile) {
    if (!targetFile || !invokePosition) {
      fail();
    }
    return {
      kind: "resolvesToDifferentFile",
      invokePosition,
      sources,
      targetFile,
    };
  } else {
    if (!invokePosition || !targetPosition) {
      fail();
    }
    return { kind: "resolves", invokePosition, targetPosition, sources };
  }
}
