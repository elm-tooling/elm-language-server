import type { ExecaSyncReturnValue } from "execa";
import { container } from "tsyringe";
import { CodeAction, Connection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { CommandManager } from "../../commandManager";
import { ElmPackageCache } from "../../compiler/elmPackageCache";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { Settings } from "../../util/settings";
import { TreeUtils } from "../../util/treeUtils";
import { Diagnostics } from "../../compiler/diagnostics";
import { CodeActionProvider } from "../codeActionProvider";
import { ICodeActionParams } from "../paramsExtensions";
import { comparePackageRanking } from "../ranking";
import { IFileSystemHost } from "../../types";

const errorCodes = [Diagnostics.ImportMissing.code];
const fixId = "install_package";
const random = Math.random();
const commandName = `elm.installPackage-${random}`;

export function register(host: IFileSystemHost): void {
  if (!host.execCmdSync) {
    return;
  }

  CodeActionProvider.registerCodeAction({
    errorCodes,
    fixId,
    getCodeActions: (params: ICodeActionParams): CodeAction[] | undefined => {
      const valueNode = TreeUtils.getNamedDescendantForRange(
        params.sourceFile,
        params.range,
      );

      const packages = ElmPackageCache.getPackagesWithModule(valueNode.text);

      return packages.sort(comparePackageRanking).map((packageName) =>
        CodeActionProvider.getCodeAction(
          params,
          `Install package "${packageName}"`,
          [],
          {
            command: commandName,
            title: "Install Package",
            arguments: [params.sourceFile.uri, packageName],
          },
        ),
      );
    },
    getFixAllCodeAction: () => {
      // We can't run multiple commands
      return undefined;
    },
  });

  CommandManager.register(
    commandName,
    async (uri: string, packageName: string) => {
      const settings = container.resolve<Settings>("Settings");
      const connection = container.resolve<Connection>("Connection");

      const program = new ElmWorkspaceMatcher((uri: string) =>
        URI.parse(uri),
      ).getProgramFor(uri);

      const clientSettings = await settings.getClientSettings();

      try {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        host.execCmdSync!(
          clientSettings.elmPath,
          "elm",
          { cmdArguments: ["install", packageName] },
          program.getRootPath().fsPath,
          clientSettings.skipInstallPackageConfirmation ? "y\n" : undefined,
        );
      } catch (e) {
        if (clientSettings.skipInstallPackageConfirmation) {
          return;
        }

        const result: ExecaSyncReturnValue = <ExecaSyncReturnValue>e;

        const message = result.stdout.replace("[Y/n]:", "").trim();

        connection.window
          .showInformationMessage(
            message,
            { title: "Yes", value: "y" },
            { title: "No", value: "n" },
          )
          .then((choice) => {
            if (choice) {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              const cmdResult = host.execCmdSync!(
                clientSettings.elmPath,
                "elm",
                { cmdArguments: ["install", packageName] },
                program.getRootPath().fsPath,
                `${choice.value}\n`,
              );

              const message = cmdResult.stdout
                .replace(result.stdout, "")
                .trim();

              connection.window.showInformationMessage(message);
            }
          })
          .catch((e: unknown) => {
            connection.console.warn(e as string);
          });
      }
    },
  );
}
