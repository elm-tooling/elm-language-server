import { Position as VSPosition } from "vscode-languageserver";
import { Point as TSPosition } from "tree-sitter-elm";

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

export function comparePosition(pos1: VSPosition, pos2: TSPosition): number {
  if (pos1.line === pos2.row && pos1.character === pos2.column) {
    return 0;
  }

  if (
    pos1.line < pos2.row ||
    (pos1.line === pos2.row && pos1.character < pos2.column)
  ) {
    return -1;
  }

  return 1;
}
