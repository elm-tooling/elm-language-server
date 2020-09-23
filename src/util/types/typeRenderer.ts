import { Tree } from "web-tree-sitter";
import {
  getTypeclassName,
  nthVarName,
  TUnion,
  TVar,
  Type,
} from "./typeInference";

export class TypeRenderer {
  private usedVarNames = new Map<TVar, string>();

  constructor(private tree: Tree) {}

  public static typeToString(t: Type, tree: Tree): string {
    return new TypeRenderer(tree).render(t);
  }

  private render(t: Type): string {
    if (t.alias) {
      return this.renderUnion(
        TUnion(t.alias.module, t.alias.name, t.alias.parameters),
      );
    }

    switch (t.nodeType) {
      case "Unknown":
        return "Unknown";
      case "InProgressBinding":
        throw new Error(
          "Should never try to convert an in progress binding type to a string",
        );
      case "Unit":
        return "()";
      case "Var":
        return this.renderVar(t);
      case "Function":
        return `${[...t.params, t.return]
          .map((p) =>
            p.nodeType === "Function" ? `(${this.render(p)})` : this.render(p),
          )
          .join(" -> ")}`;
      case "Tuple":
        return `(${t.types.map(this.render.bind(this)).join(", ")})`;
      case "Union":
        return this.renderUnion(t);
      case "Record":
      case "MutableRecord":
        return `{ ${
          t.baseType ? `${this.render(t.baseType)} | ` : ""
        }${Object.entries(t.fields)
          .map(([field, type]) => `${field} : ${this.render(type)}`)
          .join(", ")} }`;
    }
  }

  private renderUnion(t: TUnion): string {
    if (t.params.length === 0) {
      return t.name;
    } else {
      return `${t.name} ${t.params
        .map((p) =>
          p.nodeType === "Function" ||
          (p.nodeType === "Union" && p.params.length > 0) ||
          (p.alias?.parameters.length ?? 0 > 0)
            ? `(${this.render(p)})`
            : this.render(p),
        )
        .join(" ")}`;
    }
  }

  private renderVar(t: TVar): string {
    if (this.usedVarNames.has(t)) {
      return this.usedVarNames.get(t) ?? "";
    }

    const takenNames = Array.from(this.usedVarNames.values());

    if (!getTypeclassName(t) && takenNames.includes(t.name)) {
      const displayName = nthVarName(takenNames.length + 1);
      this.usedVarNames.set(t, displayName);
      return displayName;
    }

    this.usedVarNames.set(t, t.name);
    return t.name;
  }
}
