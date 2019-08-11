import { readFileSync } from "fs";
import glob from "glob";
import os from "os";
import {
  Connection,
  InitializeParams,
  InitializeResult,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import Parser, { Tree } from "web-tree-sitter";
import { CapabilityCalculator } from "./capabilityCalculator";
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

export interface ILanguageServer {
  readonly capabilities: InitializeResult;
  init(): Promise<void>;
  registerInitializedProviders(): void;
}

interface IFolder {
  path: string;
  writable: boolean;
}

export class Server implements ILanguageServer {
  private calculator: CapabilityCalculator;
  private forest: Forest = new Forest();
  private imports: IImports;
  private elmWorkspace: URI;
  private settings: Settings;
  private documentEvents: DocumentEvents;
  private textDocumentEvents: TextDocumentEvents;

  constructor(
    private connection: Connection,
    private params: InitializeParams,
    private parser: Parser,
  ) {
    this.calculator = new CapabilityCalculator(params.capabilities);

    this.imports = new Imports(parser);

    const elmWorkspaceFallback =
      // Add a trailing slash if not present
      this.params.rootUri && this.params.rootUri.replace(/\/?$/, "/");

    const initializationOptions = this.params.initializationOptions || {};
    this.elmWorkspace = URI.parse(
      initializationOptions.elmWorkspace || elmWorkspaceFallback,
    );

    this.connection.console.info(
      `Starting language server for folder: ${this.elmWorkspace}`,
    );

    this.settings = new Settings(this.connection);

    this.settings.updateSettings(initializationOptions);

    this.documentEvents = new DocumentEvents(
      this.connection,
      this.elmWorkspace,
    );
    this.textDocumentEvents = new TextDocumentEvents(this.documentEvents);
  }

  get capabilities(): InitializeResult {
    return {
      capabilities: this.calculator.capabilities,
    };
  }

  public async init() {
    const documentFormatingProvider = new DocumentFormattingProvider(
      this.connection,
      this.elmWorkspace,
      this.textDocumentEvents,
      this.settings,
    );
    const elmAnalyse = new ElmAnalyseDiagnostics(
      this.connection,
      this.elmWorkspace,
      this.textDocumentEvents,
      this.settings,
      documentFormatingProvider,
    );
    const elmMake = new ElmMakeDiagnostics(
      this.connection,
      this.elmWorkspace,
      this.settings,
    );
    // tslint:disable:no-unused-expression
    new DiagnosticsProvider(
      this.connection,
      this.elmWorkspace,
      this.textDocumentEvents,
      elmAnalyse,
      elmMake,
    );
    new CodeActionProvider(this.connection, elmAnalyse, elmMake);

    await this.initWorkspace();
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

  public async initWorkspace() {
    let elmVersion;
    try {
      elmVersion = await utils.getElmVersion(
        this.settings.getStartupClientSettings,
        this.elmWorkspace,
        this.connection,
      );
    } catch (e) {
      this.connection.console.warn(
        `Could not figure out elm version, this will impact how good the server works. \n ${e.stack}`,
      );
    }
    try {
      const path = `${this.elmWorkspace.fsPath}elm.json`;
      this.connection.console.info(`Reading elm.json from ${path}`);
      // Find elm files and feed them to tree sitter
      const elmJson = require(path);
      const type = elmJson.type;
      const elmFolders: IFolder[] = [];
      if (type === "application") {
        const sourceDirs = elmJson["source-directories"];
        sourceDirs.forEach(async (folder: string) => {
          elmFolders.push({
            path: this.elmWorkspace.fsPath + folder,
            writable: true,
          });
        });
      } else {
        elmFolders.push({
          path: `${this.elmWorkspace.fsPath}src`,
          writable: true,
        });
      }
      elmFolders.push({
        path: `${this.elmWorkspace.fsPath}tests`,
        writable: true,
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

      for (const key in dependencies) {
        if (dependencies.hasOwnProperty(key)) {
          const maintainer = key.substring(0, key.indexOf("/"));
          const packageName = key.substring(key.indexOf("/") + 1, key.length);

          const pathToPackage = `${packagesRoot}${maintainer}/${packageName}/${dependencies[key]}/src`;
          elmFolders.push({ path: pathToPackage, writable: false });
        }
      }

      const elmFilePaths = this.findElmFilesInFolders(elmFolders);
      this.connection.console.info(
        `Found ${elmFilePaths.length.toString()} files to add to the project`,
      );

      for (const filePath of elmFilePaths) {
        this.connection.console.info(`Adding ${filePath.path.toString()}`);
        const fileContent: string = readFileSync(
          filePath.path.toString(),
          "utf8",
        );
        let tree: Tree | undefined;
        tree = this.parser.parse(fileContent);
        this.forest.setTree(
          URI.file(filePath.path).toString(),
          filePath.writable,
          true,
          tree,
        );
      }

      this.forest.treeIndex.forEach(item => {
        this.connection.console.info(`Adding imports ${item.uri.toString()}`);
        this.imports.updateImports(item.uri, item.tree, this.forest);
      });

      this.connection.console.info("Done parsing all files.");
    } catch (error) {
      this.connection.console.error(error.stack);
    }
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

  private findElmFilesInFolders(elmFolders: IFolder[]): IFolder[] {
    let elmFilePaths: IFolder[] = [];
    for (const element of elmFolders) {
      elmFilePaths = elmFilePaths.concat(this.findElmFilesInFolder(element));
    }
    return elmFilePaths;
  }

  private findElmFilesInFolder(element: IFolder): IFolder[] {
    return glob
      .sync(`${element.path}/**/*.elm`)
      .map(path => ({ path, writable: element.writable }));
  }

  private packageOrPackagesFolder(elmVersion: string | undefined): string {
    return elmVersion === "0.19.0" ? "package" : "packages";
  }
}
