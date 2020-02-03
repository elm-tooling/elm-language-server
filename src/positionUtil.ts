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
