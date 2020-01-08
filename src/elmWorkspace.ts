import fs from "fs";
import globby from "globby";
import os from "os";
import path from "path";
import util from "util";
import { IConnection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import Parser, { Tree } from "web-tree-sitter";
import { Forest } from "./forest";
import { IImports, Imports } from "./imports";
import { ASTProvider } from "./providers/astProvider";
import { CodeActionProvider } from "./providers/codeActionProvider";
import { CodeLensProvider } from "./providers/codeLensProvider";
import { CompletionProvider } from "./providers/completionProvider";
import { DefinitionProvider } from "./providers/definitionProvider";
import { DiagnosticsProvider } from "./providers/diagnostics/diagnosticsProvider";
import { ElmAnalyseDiagnostics } from "./providers/diagnostics/elmAnalyseDiagnostics";
import { ElmMakeDiagnostics } from "./providers/diagnostics/elmMakeDiagnostics";
import { DocumentFormattingProvider } from "./providers/documentFormatingProvider";
import { DocumentSymbolProvider } from "./providers/documentSymbolProvider";
import { FoldingRangeProvider } from "./providers/foldingProvider";
import { HoverProvider } from "./providers/hoverProvider";
import { ReferencesProvider } from "./providers/referencesProvider";
import { RenameProvider } from "./providers/renameProvider";
import { WorkspaceSymbolProvider } from "./providers/workspaceSymbolProvider";
import { DocumentEvents } from "./util/documentEvents";
import * as utils from "./util/elmUtils";
import { Settings } from "./util/settings";
import { TextDocumentEvents } from "./util/textDocumentEvents";

const readFile = util.promisify(fs.readFile);
const readdir = util.promisify(fs.readdir);

interface IFolder {
  path: string;
  maintainerAndPackageName?: string;
  writeable: boolean;
}

export class ElmWorkspace {
  private documentEvents: DocumentEvents;
  private textDocumentEvents: TextDocumentEvents;
  private forest: Forest = new Forest();
  private imports: IImports;

  constructor(
    private elmWorkspace: URI,
    private connection: IConnection,
    private settings: Settings,
    private parser: Parser,
  ) {
    this.connection.console.info(
      `Starting language server for folder: ${this.elmWorkspace}`,
    );

    this.imports = new Imports(parser);

    this.documentEvents = new DocumentEvents(
      this.connection,
      this.elmWorkspace,
    );
    this.textDocumentEvents = new TextDocumentEvents(this.documentEvents);
  }

  public async registerInitializedProviders() {
    // tslint:disable:no-unused-expression
    new ASTProvider(
      this.connection,
      this.forest,
      this.documentEvents,
      this.imports,
      this.parser,
    );
    new FoldingRangeProvider(this.connection, this.forest);
    new CompletionProvider(this.connection, this.forest, this.imports);
    new HoverProvider(this.connection, this.forest, this.imports);
    new DefinitionProvider(this.connection, this.forest, this.imports);
    new ReferencesProvider(this.connection, this.forest, this.imports);
    new DocumentSymbolProvider(this.connection, this.forest);
    new WorkspaceSymbolProvider(this.connection, this.forest);
    new CodeLensProvider(this.connection, this.forest, this.imports);
    new RenameProvider(this.connection, this.forest, this.imports);
  }

  public async init() {
    const settings = await this.settings.getClientSettings();

    const documentFormatingProvider = new DocumentFormattingProvider(
      this.connection,
      this.elmWorkspace,
      this.textDocumentEvents,
      this.settings,
    );

    const elmAnalyse =
      settings.elmAnalyseTrigger !== "never"
        ? new ElmAnalyseDiagnostics(
            this.connection,
            this.elmWorkspace,
            this.textDocumentEvents,
            this.settings,
            documentFormatingProvider,
          )
        : null;

    const elmMake = new ElmMakeDiagnostics(
      this.connection,
      this.elmWorkspace,
      this.settings,
    );

    // tslint:disable:no-unused-expression
    new DiagnosticsProvider(
      this.connection,
      this.elmWorkspace,
      this.settings,
      this.textDocumentEvents,
      elmAnalyse,
      elmMake,
    );

    new CodeActionProvider(this.connection, elmAnalyse, elmMake);

    await this.initWorkspace();
  }

  private async initWorkspace() {
    let elmVersion;
    try {
      elmVersion = await utils.getElmVersion(
        await this.settings.getClientSettings(),
        this.elmWorkspace,
        this.connection,
      );
    } catch (e) {
      this.connection.console.warn(
        `Could not figure out elm version, this will impact how good the server works. \n ${e.stack}`,
      );
    }
    try {
      const pathToElmJson = path.join(this.elmWorkspace.fsPath, "elm.json");
      this.connection.console.info(`Reading elm.json from ${pathToElmJson}`);
      // Find elm files and feed them to tree sitter
      const elmJson = require(pathToElmJson);
      const type = elmJson.type;
      const elmFolders: Array<{
        uri: string;
        writeable: boolean;
        maintainerAndPackageName?: string;
      }> = [];
      if (type === "application") {
        elmJson["source-directories"].forEach(async (folder: string) => {
          elmFolders.push({
            maintainerAndPackageName: undefined,
            uri: path.resolve(this.elmWorkspace.fsPath, folder),
            writeable: true,
          });
        });
      } else {
        elmFolders.push({
          maintainerAndPackageName: undefined,
          uri: path.join(this.elmWorkspace.fsPath, "src"),
          writeable: true,
        });
      }
      elmFolders.push({
        maintainerAndPackageName: undefined,
        uri: path.join(this.elmWorkspace.fsPath, "tests"),
        writeable: true,
      });
      this.connection.console.info(
        `${elmFolders.length} source-dirs and test folders found`,
      );

      const elmHome = this.findElmHome();
      const packagesRoot = `${elmHome}/${elmVersion}/${this.packageOrPackagesFolder(
        elmVersion,
      )}/`;
      const dependencies: { [index: string]: string } =
        type === "application"
          ? {
              ...elmJson.dependencies.direct,
              ...elmJson["test-dependencies"].direct,
            }
          : { ...elmJson.dependencies, ...elmJson["test-dependencies"] };
      if (type === "application") {
        for (const key in dependencies) {
          if (dependencies.hasOwnProperty(key)) {
            const maintainer = key.substring(0, key.indexOf("/"));
            const packageName = key.substring(key.indexOf("/") + 1, key.length);

            const pathToPackageWithVersion = `${packagesRoot}${maintainer}/${packageName}/${dependencies[key]}/src`;
            elmFolders.push({
              maintainerAndPackageName: `${maintainer}/${packageName}`,
              uri: pathToPackageWithVersion,
              writeable: false,
            });
          }
        }
      } else {
        for (const key in dependencies) {
          if (dependencies.hasOwnProperty(key)) {
            const maintainer = key.substring(0, key.indexOf("/"));
            const packageName = key.substring(key.indexOf("/") + 1, key.length);

            const pathToPackage = `${packagesRoot}${maintainer}/${packageName}/`;
            const readDir = await readdir(pathToPackage, "utf8");

            const allVersionFolders = readDir.map(folderName => {
              return {
                version: folderName,
                versionPath: `${pathToPackage}${folderName}`,
              };
            });

            const matchedFolder = utils.findDepVersion(
              allVersionFolders,
              dependencies[key],
            );
            const pathToPackageWithVersion = matchedFolder
              ? `${matchedFolder.versionPath}/src`
              : `${
                  allVersionFolders[allVersionFolders.length - 1].versionPath
                }/src`;

            elmFolders.push({
              maintainerAndPackageName: `${maintainer}/${packageName}`,
              uri: pathToPackageWithVersion,
              writeable: false,
            });
          }
        }
      }

      const elmFilePaths = this.findElmFilesInFolders(elmFolders);
      this.connection.console.info(
        `Found ${elmFilePaths.length.toString()} files to add to the project`,
      );

      if (elmFilePaths.every(a => !a.writeable)) {
        this.connection.window.showErrorMessage(
          "The path or paths you entered in the 'source-directories' field of your 'elm.json' does not contain any elm files.",
        );
      }

      const promiseList: Array<Promise<void>> = [];
      for (const filePath of elmFilePaths) {
        promiseList.push(this.readAndAddToForest(filePath));
      }
      await Promise.all(promiseList);

      this.forest.treeIndex.forEach(item => {
        this.connection.console.info(
          `Adding imports ${URI.parse(item.uri).fsPath}`,
        );
        this.imports.updateImports(item.uri, item.tree, this.forest);
      });

      this.connection.console.info("Done parsing all files.");
    } catch (error) {
      this.connection.console.error(error.stack);
    }
  }

  private findElmFilesInFolders(
    elmFolders: Array<{
      uri: string;
      writeable: boolean;
      maintainerAndPackageName?: string;
    }>,
  ): IFolder[] {
    let elmFilePaths: IFolder[] = [];
    for (const element of elmFolders) {
      elmFilePaths = elmFilePaths.concat(this.findElmFilesInFolder(element));
    }
    return elmFilePaths;
  }

  private findElmFilesInFolder(element: {
    uri: string;
    writeable: boolean;
    maintainerAndPackageName?: string;
  }): IFolder[] {
    // Cleanup the path on windows, as globby does not like backslashes
    const globUri = element.uri.replace(/\\/g, "/");

    return globby
      .sync(`${globUri}/**/*.elm`, { suppressErrors: true })
      .map(matchingPath => ({
        maintainerAndPackageName: element.maintainerAndPackageName,
        path: matchingPath,
        writeable: element.writeable,
      }));
  }

  private packageOrPackagesFolder(elmVersion: string | undefined): string {
    return elmVersion === "0.19.0" ? "package" : "packages";
  }

  private findElmHome() {
    const elmHomeVar = process.env.ELM_HOME;

    if (elmHomeVar) {
      return elmHomeVar;
    }

    return utils.isWindows
      ? `${os.homedir()}/AppData/Roaming/elm`
      : `${os.homedir()}/.elm`;
  }

  private async readAndAddToForest(filePath: IFolder): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        this.connection.console.info(`Adding ${filePath.path.toString()}`);
        const fileContent: string = await readFile(filePath.path.toString(), {
          encoding: "utf-8",
        });

        const tree: Tree | undefined = this.parser.parse(fileContent);
        this.forest.setTree(
          URI.file(filePath.path).toString(),
          filePath.writeable,
          true,
          tree,
          filePath.maintainerAndPackageName,
        );
        resolve();
      } catch (error) {
        this.connection.console.error(error.stack);
        reject(error);
      }
    });
  }
}
