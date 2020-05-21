import execa from "execa";
import * as path from "path";
import { IConnection, SymbolKind } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { IClientSettings } from "./settings";

export const isWindows = process.platform === "win32";

/** Options for execCmd */
export interface IExecCmdOptions {
  /** Any arguments */
  cmdArguments?: string[];
  /** Shows a message if an error occurs (in particular the command not being */
  /* found), instead of rejecting. If this happens, the promise never resolves */
  showMessageOnError?: boolean;
  /** Text to add when command is not found (maybe helping how to install) */
  notFoundText?: string;
}

/** Executes a command. Shows an error message if the command isn't found */
export async function execCmd(
  cmdFromUser: string,
  cmdStatic: string,
  options: IExecCmdOptions = {},
  cwd: string,
  connection: IConnection,
  input?: string,
) {
  const cmd = cmdFromUser === "" ? cmdStatic : cmdFromUser;
  const preferLocal = cmdFromUser === "";

  const cmdArguments = options ? options.cmdArguments : [];

  try {
    return await execa(cmd, cmdArguments, {
      cwd,
      input,
      preferLocal,
      stripFinalNewline: false,
    });
  } catch (error) {
    if (error.errno === "ENOENT") {
      connection.window.showErrorMessage(
        options.notFoundText
          ? options.notFoundText
          : `Cannot find executable with name '${cmd}'`,
      );
      return Promise.reject("Executable not found");
    } else {
      return Promise.reject(error);
    }
  }
}

export function isTestFile(filename: string, rootPath: string): boolean {
  const testFolder = path.join(rootPath, "tests");
  if (filename.startsWith(testFolder)) {
    return true;
  }
  return false;
}

// Special type that has no core mock https://github.com/elm/compiler/blob/51e20357137ebc9c3f6136cf0a3fe21c24027f39/compiler/src/Canonicalize/Environment/Foreign.hs#L62
export function getEmptyTypes() {
  return [
    {
      markdown: `An \`List\` is a list of items. Every item must be of the same type. Valid syntax for lists includes:

    []
    [42, 43]
    ["one", "two", "three"]
    [3.14, 0.1234]
    ['a', 'Z', '0']

    `,
      name: "List",
      symbolKind: SymbolKind.Enum,
    },
  ];
}

export async function getElmVersion(
  settings: IClientSettings,
  elmWorkspaceFolder: URI,
  connection: IConnection,
): Promise<string> {
  const options = {
    cmdArguments: ["--version"],
    notFoundText:
      "Elm binary not found, did you install and setup the path to your binary?",
  };

  const result = await execCmd(
    settings.elmPath,
    "elm",
    options,
    elmWorkspaceFolder.fsPath,
    connection,
  );

  const version = result.stdout.trim();

  connection.console.info(`Elm version ${version} detected.`);

  return Promise.resolve(version);
}

export function findDepVersion(
  allVersionFolders: { version: string; versionPath: string }[],
  versionRange: string,
) {
  const regex = /^(\d+\.\d+\.\d+) (<|<=) v (<|<=) (\d+\.\d+\.\d+)$/gm;

  const m = regex.exec(versionRange);
  if (m) {
    const lowerRange = m[1];
    const lowerOperator = m[2];
    const upperOperator = m[3];
    const upperRange = m[4];

    const filteredVersionList = allVersionFolders
      .filter((a) => filterSemver(a.version, lowerRange, lowerOperator))
      .filter((a) => filterSemver(upperRange, a.version, upperOperator));

    const latestVersionInRange = filteredVersionList
      .map((a) => a.version)
      .sort(cmp)
      .reverse()[0];
    return allVersionFolders.find((a) => a.version === latestVersionInRange);
  } else {
    // Regex did not work, probably not a version range
    return allVersionFolders.find(
      (it: { version: string; versionPath: string }) =>
        versionRange.includes(it.version),
    );
  }
}

function filterSemver(lower: string, upper: string, operator: string) {
  const currentCompare = cmp(lower, upper);
  switch (operator) {
    case "<=":
      return currentCompare !== -1;
    case "<":
      return !(currentCompare === -1 || currentCompare === 0);
  }
}

function cmp(a: string, b: string) {
  const pa = a.split(".");
  const pb = b.split(".");
  for (let i = 0; i < 3; i++) {
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    if (na > nb) {
      return 1;
    }
    if (nb > na) {
      return -1;
    }
    if (!isNaN(na) && isNaN(nb)) {
      return 1;
    }
    if (isNaN(na) && !isNaN(nb)) {
      return -1;
    }
  }
  return 0;
}
