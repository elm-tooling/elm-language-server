import { execFileSync, spawn } from "node:child_process";
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

  const installedPackageDirectory = path.join(
    packageDirectory,
    "node_modules",
    "@elm-tooling",
    "elm-language-server",
  );
  const cli = path.join(installedPackageDirectory, "out", "node", "index.js");
  const installedPackageJson = JSON.parse(
    readFileSync(path.join(installedPackageDirectory, "package.json"), "utf8"),
  );
  const version = execFileSync(process.execPath, [cli, "--version"], {
    encoding: "utf8",
  }).trim();
  if (version !== installedPackageJson.version) {
    throw new Error(
      `Expected CLI version ${installedPackageJson.version}, received ${version}`,
    );
  }

  await initializeServer(cli, {});
  await initializeServer(cli, {
    treeSitterWasmUri: path.join(
      packageDirectory,
      "node_modules",
      "web-tree-sitter",
      "web-tree-sitter.wasm",
    ),
    treeSitterElmWasmUri: path.join(
      installedPackageDirectory,
      "out",
      "tree-sitter-elm.wasm",
    ),
  });
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

function initializeServer(cli, initializationOptions) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli], {
      cwd: packageDirectory,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = Buffer.alloc(0);
    let stdout = "";
    let stderr = "";
    let initialized = false;
    const timeout = setTimeout(() => {
      child.kill();
      reject(
        new Error(
          `Language server initialization timed out.\nstdout: ${stdout}\nstderr: ${stderr}`,
        ),
      );
    }, 15_000);

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      output = Buffer.concat([output, chunk]);
      while (true) {
        const headerEnd = output.indexOf("\r\n\r\n");
        if (headerEnd === -1) {
          return;
        }
        const header = output.subarray(0, headerEnd).toString();
        const contentLength = Number(
          /Content-Length: (\d+)/i.exec(header)?.[1],
        );
        const bodyStart = headerEnd + 4;
        const messageEnd = bodyStart + contentLength;
        if (output.length < messageEnd) {
          return;
        }
        const response = JSON.parse(
          output.subarray(bodyStart, messageEnd).toString(),
        );
        output = output.subarray(messageEnd);
        if (response.id === 2 && initialized) {
          child.stdin.write(lspMessage({ jsonrpc: "2.0", method: "exit" }));
          child.stdin.end();
          return;
        }
        if (response.id !== 1 || initialized) {
          continue;
        }

        initialized = true;
        child.stdin.write(
          lspMessage({ jsonrpc: "2.0", id: 2, method: "shutdown" }),
        );
      }
    });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (!initialized || code !== 0) {
        reject(
          new Error(
            `Language server initialization failed with code ${code}.\n${stderr}`,
          ),
        );
      } else {
        resolve();
      }
    });

    child.stdin.write(
      lspMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          processId: null,
          rootUri: null,
          capabilities: {},
          workspaceFolders: null,
          initializationOptions: { elmJsonFiles: [], ...initializationOptions },
        },
      }),
    );
  });
}

function lspMessage(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}
