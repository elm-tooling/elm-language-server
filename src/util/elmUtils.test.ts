import { findDepVersion } from "./elmUtils";

const versionFolders = [
  { version: "0.18.0", versionPath: "path/to/0.18.0" },
  { version: "0.19.0", versionPath: "path/to/0.19.0" },
  { version: "0.19.1", versionPath: "path/to/0.19.1" },
  { version: "0.19.16", versionPath: "path/to/0.19.16" },
  { version: "0.20.0", versionPath: "path/to/0.20.0" },
  { version: "0.20.1", versionPath: "path/to/0.20.1" },
];

test("fallback to normal matching for invalid version ranges", () => {
  const dependencies = "0.19.0";
  expect(findDepVersion(versionFolders, dependencies)).toStrictEqual({
    version: "0.19.0",
    versionPath: "path/to/0.19.0",
  });
});

test("finds the correct version in a version range", () => {
  const dependencies = "0.19.0 <= v < 0.20.0";
  expect(findDepVersion(versionFolders, dependencies)).toStrictEqual({
    version: "0.19.16",
    versionPath: "path/to/0.19.16",
  });
});

test("finds the correct version in a version range when upper range equals", () => {
  const dependencies = "0.19.0 <= v <= 0.20.0";
  expect(findDepVersion(versionFolders, dependencies)).toStrictEqual({
    version: "0.20.0",
    versionPath: "path/to/0.20.0",
  });
});

test("finds the correct version in a version range when lower range equals", () => {
  const versionFolders = [
    { version: "0.18.0", versionPath: "path/to/0.18.0" },
    { version: "0.19.0", versionPath: "path/to/0.19.0" },
    { version: "0.20.1", versionPath: "path/to/0.20.1" },
  ];
  const dependencies = "0.19.0 <= v < 0.20.0";
  expect(findDepVersion(versionFolders, dependencies)).toStrictEqual({
    version: "0.19.0",
    versionPath: "path/to/0.19.0",
  });
});
