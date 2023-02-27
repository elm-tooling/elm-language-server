import { SyntaxNode } from "web-tree-sitter";
import { EFieldType } from "./expressionTree";
import { SyntaxNodeSet } from "./syntaxNodeSet";

export class RecordFieldReferenceTable {
  private refsByField: Map<string, SyntaxNodeSet>;
  private _frozen = false;

  public get frozen(): boolean {
    return this._frozen;
  }

  constructor(refsByField?: Map<string, SyntaxNodeSet>) {
    this.refsByField = refsByField ?? new Map<string, SyntaxNodeSet>();
  }

  public static fromExpressions(
    fieldExpressions: EFieldType[],
  ): RecordFieldReferenceTable {
    const fieldRefs: Map<string, SyntaxNodeSet> = new Map<
      string,
      SyntaxNodeSet
    >();

    fieldExpressions.forEach((field) => {
      fieldRefs.set(field.name, new SyntaxNodeSet(field));
    });

    return new RecordFieldReferenceTable(fieldRefs);
  }

  public get(field: string): SyntaxNode[] {
    return this.refsByField.get(field)?.toArray() ?? [];
  }

  public addAll(other: RecordFieldReferenceTable): void {
    if (this._frozen || other.refsByField === this.refsByField) {
      return;
    }

    other.refsByField.forEach((refs, field) => {
      let set = this.refsByField.get(field);

      if (!set) {
        set = new SyntaxNodeSet();
        this.refsByField.set(field, set);
      }

      set.addAll(refs);
    });
  }

  public plus(other: RecordFieldReferenceTable): RecordFieldReferenceTable {
    const newRefs = new Map<string, SyntaxNodeSet>();

    this.refsByField.forEach((set, field) => {
      const newRefSet = new SyntaxNodeSet().addAll(set);
      const otherSet = other.refsByField.get(field);

      if (otherSet) {
        newRefSet.addAll(otherSet);
      }

      newRefs.set(field, newRefSet);
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
