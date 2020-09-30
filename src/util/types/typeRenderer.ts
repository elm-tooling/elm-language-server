import { IImports } from "src/imports";
import { Tree } from "web-tree-sitter";
import { TreeUtils } from "../treeUtils";
import {
  getTypeclassName,
  getVarNames,
  TUnion,
  TVar,
  Type,
} from "./typeInference";

export class TypeRenderer {
  private usedVarNames = new Map<TVar, string>();

  constructor(
    private tree?: Tree,
    private uri?: string,
    private imports?: IImports,
  ) {}

  public static typeToString(
    t: Type,
    tree?: Tree,
    uri?: string,
    imports?: IImports,
  ): string {
    return new TypeRenderer(tree, uri, imports).render(t);
  }

  private render(t: Type): string {
    if (t.alias) {
      return this.renderUnion(
        TUnion(t.alias.module, t.alias.name, t.alias.parameters),
      );
    }

    switch (t.nodeType) {
      case "Unknown":
      case "InProgressBinding":
        return "unknown";
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
    if (t.module === "WebGL" && t.name === "Shader") {
      return "shader";
    }

    let type;
    if (t.params.length === 0) {
      type = t.name;
    } else {
      type = `${t.name} ${t.params
        .map((p) =>
          p.nodeType === "Function" ||
          (p.nodeType === "Union" && p.params.length > 0) ||
          (p.alias?.parameters.length ?? 0 > 0)
            ? `(${this.render(p)})`
            : this.render(p),
        )
        .join(" ")}`;
    }

    if (this.tree && this.uri && this.imports) {
      return `${
        TreeUtils.getQualifierForName(
          this.tree,
          this.uri,
          t.module,
          t.name,
          this.imports,
        ) ?? ""
      }${type}`;
    } else {
      return type;
    }
  }

  private renderVar(t: TVar): string {
    if (this.usedVarNames.has(t)) {
      return this.usedVarNames.get(t) ?? "";
    }

    const takenNames = Array.from(this.usedVarNames.values());

    if (!getTypeclassName(t) && takenNames.includes(t.name)) {
      const displayName =
        getVarNames(takenNames.length + 1).find(
          (name) => !takenNames.includes(name),
        ) ?? "";
      this.usedVarNames.set(t, displayName);
      return displayName;
    }

    this.usedVarNames.set(t, t.name);
    return t.name;
  }
}
