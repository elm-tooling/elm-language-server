import { SyntaxNode } from "web-tree-sitter";
import { EFieldType } from "./expressionTree";

export class RecordFieldReferenceTable {
  private refsByField: Map<string, SyntaxNode[]>;
  private _frozen = false;

  public get frozen(): boolean {
    return this._frozen;
  }

  constructor(refsByField?: Map<string, SyntaxNode[]>) {
    this.refsByField = refsByField ?? new Map<string, SyntaxNode[]>();
  }

  public static fromExpressions(
    fieldExpressions: EFieldType[],
  ): RecordFieldReferenceTable {
    const fieldRefs: Map<string, SyntaxNode[]> = new Map<
      string,
      SyntaxNode[]
    >();

    fieldExpressions.forEach((field) => {
      fieldRefs.set(field.name, [field]);
    });

    return new RecordFieldReferenceTable(fieldRefs);
  }

  public get(field: string): SyntaxNode[] {
    return this.refsByField.get(field) ?? [];
  }

  public addAll(other: RecordFieldReferenceTable): void {
    if (this._frozen || other.refsByField === this.refsByField) {
      return;
    }

    other.refsByField.forEach((refs, field) => {
      let set = this.refsByField.get(field);

      if (!set) {
        this.refsByField.set(field, []);
        set = this.refsByField.get(field) ?? [];
      }

      set.push(...refs);
    });
  }

  public plus(other: RecordFieldReferenceTable): RecordFieldReferenceTable {
    const newRefs = new Map<string, SyntaxNode[]>();

    this.refsByField.forEach((set, field) => {
      const otherSet = other.refsByField.get(field) ?? [];
      newRefs.set(field, [...set, ...otherSet]);
    });
    other.refsByField.forEach((set, field) => {
      if (!newRefs.get(field)) {
        newRefs.set(field, set);
      }
    });

    return new RecordFieldReferenceTable(newRefs);
  }

  public isEmpty(): boolean {
    return this.refsByField.size === 0;
  }

  public freeze(): void {
    this._frozen = true;
  }
}
