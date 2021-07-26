import { ExecaSyncReturnValue } from "execa";
import { container } from "tsyringe";
import { CodeAction, Connection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { CommandManager } from "../../commandManager.js";
import { ElmPackageCache } from "../../compiler/elmPackageCache.js";
import { execCmdSync } from "../../compiler/utils/elmUtils.js";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher.js";
import { Settings } from "../../util/settings.js";
import { TreeUtils } from "../../util/treeUtils.js";
import { Diagnostics } from "../../compiler/diagnostics.js";
import { CodeActionProvider } from "../codeActionProvider.js";
import { ICodeActionParams } from "../paramsExtensions.js";
import { comparePackageRanking } from "../ranking.js";

const errorCodes = [Diagnostics.ImportMissing.code];
const fixId = "install_package";
const random = Math.random();
const commandName = `elm.installPackage-${random}`;

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
      execCmdSync(
        clientSettings.elmPath,
        "elm",
        { cmdArguments: ["install", packageName] },
        program.getRootPath().fsPath,
        connection,
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
            const cmdResult = execCmdSync(
              clientSettings.elmPath,
              "elm",
              { cmdArguments: ["install", packageName] },
              program.getRootPath().fsPath,
              connection,
              `${choice.value}\n`,
            );

            const message = cmdResult.stdout.replace(result.stdout, "").trim();

            connection.window.showInformationMessage(message);
          }
        })
        .catch((e) => {
          connection.console.warn(e);
        });
    }
  },
);
