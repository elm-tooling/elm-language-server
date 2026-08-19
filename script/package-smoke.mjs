import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const temporaryDirectory = mkdtempSync(
  path.join(tmpdir(), "elm-language-server-package-"),
);
const packageDirectory = path.join(temporaryDirectory, "package");

try {
  execFileSync(npm, ["pack", "--pack-destination", temporaryDirectory], {
    stdio: "pipe",
  });
  const archive = path.join(
    temporaryDirectory,
    readdirSync(temporaryDirectory).find((file) => file.endsWith(".tgz")),
  );

  mkdirSync(packageDirectory);
  writeFileSync(
    path.join(packageDirectory, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  execFileSync(
    npm,
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", archive],
    { cwd: packageDirectory, stdio: "pipe" },
  );

  writeFileSync(
    path.join(packageDirectory, "smoke.mjs"),
    `import * as languageServer from "@elm-tooling/elm-language-server";
if (!languageServer.Protocol) throw new Error("Protocol export missing");
`,
  );
  execFileSync(process.execPath, ["smoke.mjs"], {
    cwd: packageDirectory,
    stdio: "pipe",
  });

  const cli = path.join(
    packageDirectory,
    "node_modules",
    "@elm-tooling",
    "elm-language-server",
    "out",
    "node",
    "index.js",
  );
  const installedPackageJson = JSON.parse(
    readFileSync(
      path.join(
        packageDirectory,
        "node_modules",
        "@elm-tooling",
        "elm-language-server",
        "package.json",
      ),
      "utf8",
    ),
  );
  const version = execFileSync(process.execPath, [cli, "--version"], {
    encoding: "utf8",
  }).trim();
  if (version !== installedPackageJson.version) {
    throw new Error(
      `Expected CLI version ${installedPackageJson.version}, received ${version}`,
    );
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
