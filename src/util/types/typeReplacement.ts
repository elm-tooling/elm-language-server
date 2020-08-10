import {
  TVar,
  Type,
  Info,
  TFunction,
  uncurryFunction,
  TUnion,
} from "./typeInference";

export class TypeReplacement {
  private replacements: Map<TVar, [boolean, Type]>;

  constructor(
    replacements: Map<TVar, Type>,
    private freshen: boolean,
    private keepRecordsMutable: boolean,
    private varsToRemainRigid?: TVar[],
  ) {
    this.replacements = new Map<TVar, [boolean, Type]>();
    replacements.forEach((value, key) => {
      this.replacements.set(key, [false, value]);
    });
  }

  public static replace(
    type: Type,
    replacements: Map<TVar, Type>,
    keepRecordsMutable = false,
    varsToRemainRigid?: TVar[],
  ): Type {
    if (!varsToRemainRigid && replacements.size === 0) {
      return type;
    }

    return new TypeReplacement(
      replacements,
      false,
      false,
      varsToRemainRigid,
    ).replace(type);
  }

  public static freshenVars(type: Type): Type {
    return new TypeReplacement(new Map(), true, false).replace(type);
  }

  public static flexify(type: Type): Type {
    return new TypeReplacement(new Map(), false, false, []).replace(type);
  }

  private replace(type: Type): Type {
    switch (type.nodeType) {
      case "Var":
        return this.getReplacement(type) ?? type;
      case "Function":
        return this.replaceFunction(type);
      case "Union":
        return this.replaceUnion(type);
      case "Unknown":
        return {
          nodeType: "Unknown",
          info: type.info ? this.replaceInfo(type.info) : undefined,
        };
    }
  }

  private replaceInfo(info: Info): Info {
    return {
      ...info,
      parameters: info.parameters.map((param) => this.replace(param)),
    };
  }

  private replaceFunction(type: TFunction): TFunction {
    const params = type.params.map((param) => this.replace(param));
    return uncurryFunction({
      nodeType: "Function",
      params,
      return: this.replace(type.return),
      info: type.info ? this.replaceInfo(type.info) : undefined,
    });
  }

  private replaceUnion(type: TUnion): TUnion {
    if (type.params.length === 0 && !type.info) {
      return type;
    }

    const params = type.params.map((param) => this.replace(param));
    return {
      nodeType: "Union",
      params,
      module: type.module,
      name: type.name,
      info: type.info ? this.replaceInfo(type.info) : undefined,
    };
  }

  private getReplacement(key: TVar): Type | undefined {
    const replacement = this.replacements.get(key);

    if (!replacement) {
      if (this.freshen || this.varsToRemainRigid) {
        if (
          key.rigid &&
          (!this.varsToRemainRigid || this.varsToRemainRigid.includes(key))
        ) {
          return undefined;
        } else {
          const newVar: TVar = {
            nodeType: "Var",
            name: key.name,
            rigid: false,
          };
          this.replacements.set(key, [true, newVar]);
          return newVar;
        }
      }

      return undefined;
    }

    const hasBeenAccessed = replacement[0];
    const storedType = replacement[1];

    if (hasBeenAccessed) {
      return storedType;
    }

    const replacedType = this.replace(storedType);
    this.replacements.set(key, [true, replacedType]);
    return replacedType;
  }
}
