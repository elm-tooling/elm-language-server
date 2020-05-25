import { Position } from "vscode-languageserver";

export function getCaretPositionFromSource(
  source: string[],
): { position?: Position; newSource: string[] } {
  const result: {
    newSource: string[];
    position?: Position;
  } = { newSource: source };

  source.forEach((s, line) => {
    const character = s.search("{-caret-}");
    result.newSource[line] = s.replace("{-caret-}", "");

    if (character >= 0) {
      result.position = { line, character };
    }
  });

  return result;
}

export function getInvokeAndTargetPositionFromSource(
  source: string,
): {
  invokePosition?: Position;
  targetPosition?: Position;
  newSource: string;
  unresolved: boolean;
} {
  const result: {
    newSource: string;
    invokePosition?: Position;
    targetPosition?: Position;
    unresolved: boolean;
  } = { newSource: source, unresolved: false };

  source.split("\n").forEach((s, line) => {
    const invokeUnresolvedCharacter = s.search(/--(\^unresolved)/);
    const invokeCharacter = s.search(/--(\^)/);
    const targetCharacter = s.search(/--(X)/);

    if (invokeUnresolvedCharacter >= 0) {
      result.invokePosition = {
        line: line - 1,
        character: invokeUnresolvedCharacter + 2,
      };
      result.unresolved = true;
    } else if (invokeCharacter >= 0) {
      result.invokePosition = {
        line: line - 1,
        character: invokeCharacter + 2,
      };
    }
    if (targetCharacter >= 0) {
      result.targetPosition = {
        line: line - 1,
        character: targetCharacter + 2,
      };
    }
  });

  return result;
}
