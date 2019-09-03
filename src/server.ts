import globby from "globby";
import path from "path";
import {
  Connection,
  InitializeParams,
  InitializeResult,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import Parser from "web-tree-sitter";
import { CapabilityCalculator } from "./capabilityCalculator";
import { ElmWorkspace } from "./elmWorkspace";
import { Settings } from "./util/settings";

export interface ILanguageServer {
  readonly capabilities: InitializeResult;
  init(): Promise<void>;
  registerInitializedProviders(): void;
}

export class Server implements ILanguageServer {
  private calculator: CapabilityCalculator;
  private settings: Settings;
  private elmWorkspaceMap: Map<string, ElmWorkspace> = new Map();

  constructor(
    private connection: Connection,
    private params: InitializeParams,
    private parser: Parser,
  ) {
    this.calculator = new CapabilityCalculator(params.capabilities);

    const initializationOptions = this.params.initializationOptions || {};
    this.settings = new Settings(
      this.connection,
      initializationOptions,
      params.capabilities,
    );

    const uri = this.getWorkspaceUri(params);

    if (uri) {
      // Cleanup the path on windows, as globby does not like backslashes
      const globUri = uri.fsPath.replace(/\\/g, "/");
      const elmJsonGlob = `${globUri}/**/elm.json`;

      const elmJsons = globby.sync([
        elmJsonGlob,
        "!**/node_modules/**",
        "!**/elm-stuff/**",
      ]);
      if (elmJsons.length > 0) {
        connection.console.info(
          `Found ${elmJsons.length} elm.json files for workspace ${globUri}`,
        );
        const listOfElmJsonFolders = elmJsons.map(a =>
          this.getElmJsonFolder(a),
        );
        const topLevelElmJsons: Map<string, URI> = this.findTopLevelFolders(
          listOfElmJsonFolders,
        );
        connection.console.info(
          `Found ${topLevelElmJsons.size} unique elmWorkspaces for workspace ${globUri}`,
        );

        topLevelElmJsons.forEach(elmWorkspace => {
          this.elmWorkspaceMap.set(
            elmWorkspace.toString(),
            new ElmWorkspace(
              elmWorkspace,
              connection,
              this.settings,
              this.parser,
            ),
          );
        });
      } else {
        this.connection.console.info(`No elm.json found`);
      }
    } else {
      this.connection.console.info(`No workspace was setup by the client`);
    }
  }

  get capabilities(): InitializeResult {
    return {
      capabilities: this.calculator.capabilities,
    };
  }

  public async init() {
    this.elmWorkspaceMap.forEach(async it => await it.init());
  }

  public async registerInitializedProviders() {
    // We can now query the client for up to date settings
    this.settings.initFinished();

    this.elmWorkspaceMap.forEach(it => it.registerInitializedProviders());
  }

  private getElmJsonFolder(uri: string): URI {
    return URI.file(path.dirname(uri));
  }

  private findTopLevelFolders(listOfElmJsonFolders: URI[]) {
    const result: Map<string, URI> = new Map();
    listOfElmJsonFolders.forEach(element => {
      result.set(element.toString(), element);
    });

    listOfElmJsonFolders.forEach(a => {
      listOfElmJsonFolders.forEach(b => {
        if (
          b.toString() !== a.toString() &&
          b.toString().startsWith(a.toString())
        ) {
          result.delete(b.toString());
        }
      });
    });

    return result;
  }

  private getWorkspaceUri(params: InitializeParams) {
    if (params.rootUri) {
      return URI.parse(params.rootUri);
    } else if (params.rootPath) {
      return URI.file(params.rootPath);
    } else {
      return null;
    }
  }
}
