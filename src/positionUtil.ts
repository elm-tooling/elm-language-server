import { Position as VSPosition } from "vscode-languageserver";
import { Point as TSPosition } from "web-tree-sitter";

export class PositionUtil {
  public static FROM_VS_POSITION(position: VSPosition): PositionUtil {
    return new PositionUtil(position.line, position.character);
  }

  public static FROM_TS_POSITION(position: TSPosition): PositionUtil {
    return new PositionUtil(position.row, position.column);
  }

  private row: number;
  private col: number;

  constructor(row: number, col: number) {
    this.row = row;
    this.col = col;
  }

  public toVSPosition(): VSPosition {
    return VSPosition.create(this.row, this.col);
  }

  public toTSPosition(): TSPosition {
    return {
      column: this.col,
      row: this.row,
    };
  }
}

export function comparePosition(
  _pos1: VSPosition | TSPosition,
  _pos2: VSPosition | TSPosition,
): number {
  // Convert TSPosition to VSPosition
  const pos1 =
    "row" in _pos1
      ? PositionUtil.FROM_TS_POSITION(_pos1).toVSPosition()
      : _pos1;
  const pos2 =
    "row" in _pos2
      ? PositionUtil.FROM_TS_POSITION(_pos2).toVSPosition()
      : _pos2;

  if (pos1.line === pos2.line && pos1.character === pos2.character) {
    return 0;
  }

  if (
    pos1.line < pos2.line ||
    (pos1.line === pos2.line && pos1.character < pos2.character)
  ) {
    return -1;
  }

  return 1;
}
