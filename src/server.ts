import { readFileSync } from "fs";
import glob from "glob";
import os from "os";
import Parser, { Tree } from "tree-sitter";
import TreeSitterElm from "tree-sitter-elm";
import {
  Connection,
  IConnection,
  InitializeParams,
  InitializeResult,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { CapabilityCalculator } from "./capabilityCalculator";
import { Forest } from "./forest";
import { IForest } from "./forest";
import { IImports, Imports } from "./imports";
import { ASTProvider } from "./providers/astProvider";
import { CodeActionProvider } from "./providers/codeActionProvider";
import { CodeLensProvider } from "./providers/codeLensProvider";
import { CompletionProvider } from "./providers/completionProvider";
import { DefinitionProvider } from "./providers/definitionProvider";
import { DiagnosticsProvider } from "./providers/diagnostics/diagnosticsProvider";
import { ElmAnalyseDiagnostics } from "./providers/diagnostics/elmAnalyseDiagnostics";
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
}

interface IFolder {
  path: string;
  writable: boolean;
}

export class Server implements ILanguageServer {
  private calculator: CapabilityCalculator;

  constructor(connection: Connection, params: InitializeParams) {
    this.calculator = new CapabilityCalculator(params.capabilities);
    const forest = new Forest();
    const imports = new Imports();
    const parser = new Parser();
    try {
      parser.setLanguage(TreeSitterElm);
    } catch (error) {
      connection.console.info(error.toString());
    }

    const elmWorkspaceFallback =
      // Add a trailing slash if not present
      params.rootUri && params.rootUri.replace(/\/?$/, "/");
    const elmWorkspace = URI.parse(
      params.initializationOptions.elmWorkspace || elmWorkspaceFallback,
    );

    const settings = new Settings(
      params.capabilities,
      params.initializationOptions,
    );

    if (elmWorkspace) {
      connection.console.info(`initializing - folder: "${elmWorkspace}"`);
      this.registerProviders(
        connection,
        forest,
        elmWorkspace,
        imports,
        settings,
        parser,
      );
    } else {
      connection.console.info(`No workspace.`);
    }
  }

  get capabilities(): InitializeResult {
    return {
      capabilities: this.calculator.capabilities,
    };
  }

  private initialize(
    connection: IConnection,
    forest: IForest,
    elmWorkspace: URI,
    imports: IImports,
    parser: Parser,
  ): void {
    try {
      const path = `${elmWorkspace.fsPath}elm.json`;
      connection.console.info(`Reading elm.json from ${path}`);
      // Find elm files and feed them to tree sitter
      const elmJson = require(path);
      const type = elmJson.type;
      const elmFolders: IFolder[] = [];
      let elmVersion = "";
      if (type === "application") {
        elmVersion = elmJson["elm-version"];
        const sourceDirs = elmJson["source-directories"];
        sourceDirs.forEach(async (folder: string) => {
          elmFolders.push({
            path: elmWorkspace.fsPath + folder,
            writable: true,
          });
        });
      } else {
        // Todo find a better way to do this
        elmVersion = elmJson["elm-version"];
        if (elmVersion.indexOf(" ") !== -1) {
          elmVersion = elmVersion.substring(0, elmVersion.indexOf(" "));
        }
        elmFolders.push({
          path: `${elmWorkspace.fsPath}src`,
          writable: true,
        });
      }
      elmFolders.push({
        path: `${elmWorkspace.fsPath}tests`,
        writable: true,
      });

      connection.console.info(`${elmFolders.length} source-dirs found`);
      const elmHome = this.findElmHome();
      // TODO find a way to detect this
      const packagesRoot = `${elmHome}/${elmVersion}/package/`;
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

          // We should probably parse the elm json of a dependency, at some point down the line
          const pathToPackage =
            type === "application"
              ? `${packagesRoot}${maintainer}/${packageName}/${dependencies[key]}/src`
              : `${packagesRoot}${maintainer}/${packageName}/${dependencies[
                  key
                ].substring(0, elmVersion.indexOf(" "))}`;
          elmFolders.push({ path: pathToPackage, writable: false });
        }
      }

      const elmFilePaths = this.findElmFilesInFolders(elmFolders);
      connection.console.info(
        `Found ${elmFilePaths.length.toString()} files to add to the project`,
      );

      for (const filePath of elmFilePaths) {
        connection.console.info(`Adding ${filePath.path.toString()}`);
        const fileContent: string = readFileSync(
          filePath.path.toString(),
          "utf8",
        );
        let tree: Tree | undefined;
        tree = parser.parse(fileContent);
        forest.setTree(
          URI.file(filePath.path).toString(),
          filePath.writable,
          true,
          tree,
        );
      }

      forest.treeIndex.forEach(item => {
        connection.console.info(`Adding imports ${item.uri.toString()}`);
        imports.updateImports(item.uri, item.tree, forest);
      });

      connection.console.info("Done parsing all files.");
    } catch (error) {
      connection.console.info(error.toString());
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

  private registerProviders(
    connection: IConnection,
    forest: Forest,
    elmWorkspace: URI,
    imports: Imports,
    settings: Settings,
    parser: Parser,
  ): void {
    this.initialize(connection, forest, elmWorkspace, imports, parser);
    const documentEvents = new DocumentEvents(connection);
    const textDocumentEvents = new TextDocumentEvents(documentEvents);
    const documentFormatingProvider = new DocumentFormattingProvider(
      connection,
      elmWorkspace,
      textDocumentEvents,
      settings,
    );
    const elmAnalyse = new ElmAnalyseDiagnostics(
      connection,
      elmWorkspace,
      textDocumentEvents,
      settings,
      documentFormatingProvider,
    );
    // tslint:disable:no-unused-expression
    new ASTProvider(connection, forest, documentEvents, imports, parser);
    new FoldingRangeProvider(connection, forest);
    new CompletionProvider(connection, forest, imports);
    new HoverProvider(connection, forest, imports);
    new DiagnosticsProvider(
      connection,
      elmWorkspace,
      textDocumentEvents,
      settings,
      elmAnalyse,
    );
    new DefinitionProvider(connection, forest, imports);
    new ReferencesProvider(connection, forest, imports);
    new DocumentSymbolProvider(connection, forest);
    new WorkspaceSymbolProvider(connection, forest);
    new CodeLensProvider(connection, forest, imports);
    new RenameProvider(connection, forest, imports);
    new CodeActionProvider(connection, elmAnalyse);
  }
}
