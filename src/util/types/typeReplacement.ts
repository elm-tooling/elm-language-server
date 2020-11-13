import { performance } from "perf_hooks";
import { RecordFieldReferenceTable } from "./recordFieldReferenceTable";
import {
  TVar,
  Type,
  Alias,
  TFunction,
  uncurryFunction,
  TUnion,
  TTuple,
  TRecord,
  TMutableRecord,
} from "./typeInference";

export let replaceTime = 0;
export function resetReplaceTime(): void {
  replaceTime = 0;
}

export class TypeReplacement {
  constructor(
    private replacements: Map<TVar, Type | [boolean, Type]>,
    private freshen: boolean,
    private keepRecordsMutable: boolean,
    private varsToRemainRigid?: TVar[],
  ) {}

  public static replace(
    type: Type,
    replacements: Map<TVar, Type>,
    keepRecordsMutable = false,
    varsToRemainRigid?: TVar[],
  ): Type {
    const start = performance.now();
    try {
      if (!varsToRemainRigid && replacements.size === 0) {
        return type;
      }

      return new TypeReplacement(
        replacements,
        false,
        keepRecordsMutable,
        varsToRemainRigid,
      ).replace(type);
    } finally {
      replaceTime += performance.now() - start;
    }
  }

  public static freshenVars(type: Type): Type {
    return new TypeReplacement(new Map(), true, false).replace(type);
  }

  public static flexify(type: Type): Type {
    return new TypeReplacement(new Map(), false, false, []).replace(type);
  }

  public static freeze(type: Type): void {
    switch (type.nodeType) {
      case "Tuple":
        type.types.forEach(this.freeze.bind(this));
        break;
      case "Record":
      case "MutableRecord":
        (type.baseType as TRecord)?.fieldReferences?.freeze();
        for (const field in type.fields) {
          this.freeze(type.fields[field]);
        }
        type.fieldReferences.freeze();
        break;
      case "Union":
        type.params.forEach(this.freeze.bind(this));
        break;
      case "Function":
        this.freeze(type.return);
        type.params.forEach(this.freeze.bind(this));
        break;
    }

    type.alias?.parameters.forEach(TypeReplacement.freeze.bind(this));
  }

  private replace(type: Type): Type {
    switch (type.nodeType) {
      case "Var":
        return this.getReplacement(type) ?? type;
      case "Function":
        return this.replaceFunction(type);
      case "Union":
        return this.replaceUnion(type);
      case "Tuple":
        return this.replaceTuple(type);
      case "Record":
        return this.replaceRecord(
          type.fields,
          type.fieldReferences,
          false,
          type.baseType,
          type.alias,
        );
      case "MutableRecord":
        return this.replaceRecord(
          type.fields,
          type.fieldReferences,
          true,
          type.baseType,
        );
      case "Unit":
      case "InProgressBinding":
        return type;
      case "Unknown":
        return {
          nodeType: "Unknown",
          alias: this.replaceAlias(type.alias),
        };
    }
  }

  private replaceAlias(alias?: Alias): Alias | undefined {
    if (alias) {
      return {
        ...alias,
        parameters: alias.parameters.map((param) => this.replace(param)),
      };
    }
  }

  private replaceTuple(type: TTuple): TTuple {
    return TTuple(
      type.types.map((t) => this.replace(t)),
      this.replaceAlias(type.alias),
    );
  }

  private replaceFunction(type: TFunction): TFunction {
    const params = type.params.map((param) => this.replace(param));
    return uncurryFunction(
      TFunction(
        params,
        this.replace(type.return),
        this.replaceAlias(type.alias),
      ),
    );
  }

  private replaceUnion(type: TUnion): TUnion {
    if (type.params.length === 0 && !type.alias) {
      return type;
    }

    const params = type.params.map((param) => this.replace(param));
    return TUnion(
      type.module,
      type.name,
      params,
      this.replaceAlias(type.alias),
    );
  }

  private replaceRecord(
    fields: { [key: string]: Type },
    fieldReferences: RecordFieldReferenceTable,
    wasMutable: boolean,
    baseType?: Type,
    alias?: Alias,
  ): Type {
    const oldBase =
      !baseType || baseType.nodeType !== "Var"
        ? undefined
        : this.getReplacement(baseType);

    let newBase = oldBase;

    if (oldBase?.nodeType === "Record") {
      newBase = oldBase.baseType;
    } else if (!oldBase) {
      if (baseType?.nodeType === "MutableRecord" && !this.keepRecordsMutable) {
        newBase = this.replace(baseType);
      } else {
        newBase = baseType;
      }
    }

    const baseFields = (oldBase as TRecord)?.fields ?? [];
    const baseFieldRefs = (oldBase as TRecord)?.fieldReferences;

    const newFields: { [key: string]: Type } = {};

    for (const field in baseFields) {
      newFields[field] = baseFields[field];
    }

    for (const field in fields) {
      newFields[field] = this.replace(fields[field]);
    }

    let newFieldReferences: RecordFieldReferenceTable;

    if (!baseFieldRefs || baseFieldRefs.isEmpty()) {
      newFieldReferences = fieldReferences;
    } else if (fieldReferences.frozen) {
      newFieldReferences = fieldReferences.plus(baseFieldRefs);
    } else {
      fieldReferences.addAll(baseFieldRefs);
      newFieldReferences = fieldReferences;
    }

    if (wasMutable && this.keepRecordsMutable) {
      return TMutableRecord(newFields, newBase, newFieldReferences);
    } else {
      return TRecord(
        newFields,
        newBase,
        this.replaceAlias(alias),
        newFieldReferences,
      );
    }
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
          const newVar = TVar(key.name);
          this.replacements.set(key, [true, newVar]);
          return newVar;
        }
      }

      return undefined;
    }

    let hasBeenAccessed = false;
    let storedType;
    if (Array.isArray(replacement)) {
      hasBeenAccessed = replacement[0];
      storedType = replacement[1];
    } else {
      storedType = replacement;
    }

    if (hasBeenAccessed) {
      return storedType;
    }

    const replacedType = this.replace(storedType);
    this.replacements.set(key, [true, replacedType]);
    return replacedType;
  }
}
