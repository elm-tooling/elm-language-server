import {
  IConstraint,
  IElmPackageCache,
  IPackage,
  IVersion,
} from "../src/elmWorkspace";
import { parseContraint, solveDependencies } from "../src/util/elmUtils";

describe("module resolution solver", () => {
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

  const c = parseContraint;

  const packageCache: IElmPackageCache = {
    get: (packageName: string): IPackage[] => {
      switch (packageName) {
        case "B":
          return [
            {
              version: v(1, 0, 0),
              dependencies: new Map(),
            },
            {
              version: v(1, 0, 1),
              dependencies: new Map(),
            },
            {
              version: v(1, 0, 2),
              dependencies: new Map(),
            },
            {
              version: v(1, 0, 3),
              dependencies: new Map(),
            },
          ];

        case "C":
          return [
            {
              version: v(1, 0, 0),
              dependencies: new Map([["B", c("1.0.1 <= v < 1.0.3")]]),
            },
          ];

        case "D":
          return [
            {
              version: v(1, 0, 0),
              dependencies: new Map([
                ["B", c("1.0.1 <= v < 1.0.2")],
                ["C", c("1.0.0 <= v < 2.0.0")],
              ]),
            },
          ];
      }

      return [];
    },
  };

  function test(
    deps: [string, IConstraint][],
    expected: [string, IVersion][] | undefined,
    cache = packageCache,
  ) {
    expect(solveDependencies(cache, new Map(deps))).toEqual(
      expected ? new Map(expected) : undefined,
    );
  }

  it("handles empty input", () => {
    test([], []);
  });

  it("trivial resolve", () => {
    test(
      [["C", c("1.0.0 <= v < 2.0.0")]],
      [
        ["B", v(1, 0, 2)],
        ["C", v(1, 0, 0)],
      ],
    );
  });

  it("picks highest available version", () => {
    test([["B", c("1.0.0 <= v < 2.0.0")]], [["B", v(1, 0, 3)]]);
  });

  it("resolve mutual constraints", () => {
    test(
      [
        ["B", c("1.0.0 <= v < 1.0.4")],
        ["C", c("1.0.0 <= v < 2.0.0")],
      ],
      [
        ["B", v(1, 0, 2)],
        ["C", v(1, 0, 0)],
      ],
    );
  });

  it("resolve mutual constraints - multiple levels", () => {
    test(
      [
        ["B", c("1.0.0 <= v < 1.0.4")],
        ["C", c("1.0.0 <= v < 2.0.0")],
        ["D", c("1.0.0 <= v < 2.0.0")],
      ],
      [
        ["B", v(1, 0, 1)],
        ["C", v(1, 0, 0)],
        ["D", v(1, 0, 0)],
      ],
    );
  });

  it("resolve extended constraints can be merged", () => {
    test(
      [
        ["A", c("1.0.0 <= v < 2.0.0")],
        ["B", c("1.0.0 <= v < 2.1.0")],
      ],
      [
        ["A", v(1, 0, 0)],
        ["B", v(2, 0, 0)],
      ],
      {
        get: (packageName: string): IPackage[] => {
          switch (packageName) {
            case "A":
              return [
                {
                  version: v(1, 0, 0),
                  dependencies: new Map([["B", c("1.0.0 <= v < 3.0.0")]]),
                },
              ];

            case "B":
              return [
                { version: v(1, 0, 0), dependencies: new Map() },
                { version: v(2, 0, 0), dependencies: new Map() },
                { version: v(2, 1, 0), dependencies: new Map() },
              ];
          }

          return [];
        },
      },
    );
  });

  it("resolve extended constraints cannot be merged - conflict on B", () => {
    test(
      [
        ["A", c("1.0.0 <= v < 2.0.0")],
        ["B", c("1.0.0 <= v < 2.0.0")],
      ],
      undefined,
      {
        get: (packageName: string): IPackage[] => {
          switch (packageName) {
            case "A":
              return [
                {
                  version: v(1, 0, 0),
                  dependencies: new Map([["B", c("2.0.0 <= v < 3.0.0")]]),
                },
              ];

            case "B":
              return [
                { version: v(1, 0, 0), dependencies: new Map() },
                { version: v(2, 0, 0), dependencies: new Map() },
              ];
          }

          return [];
        },
      },
    );
  });

  it("no solution because version constraint is lower than lowest version in package cache", () => {
    test([["C", c("0.0.0 <= v < 1.0.0")]], undefined);
  });

  it("no solution because version constraint is higher than max version in package cache", () => {
    test([["C", c("9.0.0 <= v < 10.0.0")]], undefined);
  });

  it("no solution because mutual constraints conflict with each other", () => {
    test(
      [
        ["B", c("1.0.3 <= v < 1.0.4")],
        ["C", c("1.0.0 <= v < 2.0.0")],
      ],
      undefined,
    );
  });
});
