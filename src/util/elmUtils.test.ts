import { findDepVersion } from "./elmUtils";

test("finds the first version in a version range", () => {
  const versionFolders = [
    { version: "0.19.0", versionPath: "path/to/0.19.0" },
    { version: "0.19.1", versionPath: "path/to/0.19.1" },
  ];
  const dependencies = "0.19.0 <= v < 0.20.0";
  expect(findDepVersion(versionFolders, dependencies)).toStrictEqual({
    version: "0.19.0",
    versionPath: "path/to/0.19.0",
  });
});
