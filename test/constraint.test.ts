import {
  constraintIntersect,
  IConstraint,
  IVersion,
  parseConstraint,
  versionSatifiesConstraint,
} from "../src/util/elmUtils";

describe("constraint test", () => {
  function v(
    major: number,
    minor: number,
    patch: number,
    preReleaseFields?: string[],
  ): IVersion {
    return {
      major,
      minor,
      patch,
      string: preReleaseFields
        ? `${major}.${minor}.${patch}-${preReleaseFields.join(".")}`
        : `${major}.${minor}.${patch}`,
    };
  }

  const c = parseConstraint;

  it("can determine whether a version satifies a half-open constraint", () => {
    const c: IConstraint = {
      lower: v(1, 0, 0),
      upper: v(2, 0, 0),
      lowerOperator: "<=",
      upperOperator: "<",
    };

    expect(versionSatifiesConstraint(v(0, 9, 0), c)).toBe(false);
    expect(versionSatifiesConstraint(v(1, 0, 0), c)).toBe(true);
    expect(versionSatifiesConstraint(v(1, 1, 0), c)).toBe(true);
    expect(versionSatifiesConstraint(v(2, 0, 0), c)).toBe(false);
  });

  it("can determine whether a version satisfies an inclusive constraint", () => {
    const c: IConstraint = {
      lower: v(1, 0, 0),
      upper: v(2, 0, 0),
      lowerOperator: "<=",
      upperOperator: "<=",
    };

    expect(versionSatifiesConstraint(v(0, 9, 0), c)).toBe(false);
    expect(versionSatifiesConstraint(v(1, 0, 0), c)).toBe(true);
    expect(versionSatifiesConstraint(v(1, 1, 0), c)).toBe(true);
    expect(versionSatifiesConstraint(v(2, 0, 0), c)).toBe(true);
    expect(versionSatifiesConstraint(v(2, 1, 0), c)).toBe(false);
  });

  it("can determine whether a version satisfies a SemVer constraint", () => {
    const c: IConstraint = {
      lower: v(1, 0, 0),
      upper: v(2, 0, 0),
      lowerOperator: "<=",
      upperOperator: "<",
    };
    expect(versionSatifiesConstraint(v(0, 9, 0), c)).toBe(false);
    expect(versionSatifiesConstraint(v(0, 9, 0, ["alpha"]), c)).toBe(false);
    expect(versionSatifiesConstraint(v(1, 0, 0), c)).toBe(true);
    expect(versionSatifiesConstraint(v(1, 0, 0, ["alpha"]), c)).toBe(true);
    expect(versionSatifiesConstraint(v(1, 1, 0), c)).toBe(true);
    expect(versionSatifiesConstraint(v(1, 1, 0, ["alpha"]), c)).toBe(true);
    expect(versionSatifiesConstraint(v(2, 0, 0), c)).toBe(false);
    expect(versionSatifiesConstraint(v(2, 0, 0, ["alpha"]), c)).toBe(false);
  });

  it("parse works on good input", () => {
    expect({
      lower: v(1, 0, 0),
      upper: v(2, 0, 0),
      lowerOperator: "<=",
      upperOperator: "<",
    }).toEqual(c("1.0.0 <= v < 2.0.0"));
  });

  it("parse throws on bad input", () => {
    expect(() => c("1.0.0 <= v <= bogus")).toThrow();
  });

  it("empty intersection", () => {
    expect(
      constraintIntersect(c("1.0.0 <= v < 1.0.1"), c("1.0.1 <= v < 2.0.0")),
    ).toBeUndefined();
    expect(
      constraintIntersect(c("1.0.0 <= v < 1.1.0"), c("1.1.0 <= v < 2.0.0")),
    ).toBeUndefined();
    expect(
      constraintIntersect(c("1.0.0 <= v < 2.0.0"), c("2.0.0 <= v < 3.0.0")),
    ).toBeUndefined();
  });

  it("non-empty intersection", () => {
    expect(
      constraintIntersect(c("1.0.0 <= v < 2.0.0"), c("1.0.0 <= v < 3.0.0")),
    ).toEqual(c("1.0.0 <= v < 2.0.0"));
    expect(
      constraintIntersect(c("1.0.0 <= v < 3.0.0"), c("2.0.0 <= v < 3.0.0")),
    ).toEqual(c("2.0.0 <= v < 3.0.0"));
    expect(
      constraintIntersect(c("1.0.0 <= v < 3.0.0"), c("2.0.0 <= v < 4.0.0")),
    ).toEqual(c("2.0.0 <= v < 3.0.0"));
    expect(
      constraintIntersect(c("1.0.0 <= v < 2.0.0"), c("1.0.0 <= v < 1.1.0")),
    ).toEqual(c("1.0.0 <= v < 1.1.0"));
    expect(
      constraintIntersect(c("1.0.0 <= v < 1.3.0"), c("1.2.0 <= v < 1.4.0")),
    ).toEqual(c("1.2.0 <= v < 1.3.0"));
    expect(
      constraintIntersect(c("1.2.3 <= v < 2.0.0"), c("1.1.1 <= v < 1.3.0")),
    ).toEqual(c("1.2.3 <= v < 1.3.0"));
  });
});
