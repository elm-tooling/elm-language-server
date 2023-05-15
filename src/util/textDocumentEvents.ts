import { container } from "tsyringe";
import {
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentParams,
  Emitter,
  Event,
  TextDocumentsConfiguration,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { IDocumentEvents } from "./documentEvents";

// This is loosely based on https://github.com/Microsoft/vscode-languageserver-node/blob/73180893ca/server/src/main.ts#L124
// With some simplifications and the ability to support multiple listeners
export class TextDocumentEvents {
  // a single store of documents shared by all workspaces
  private _documents: { [uri: string]: TextDocument } = {};
  private _configuration: TextDocumentsConfiguration<TextDocument> =
    TextDocument;

  private _onDidChange: Emitter<DidChangeTextDocumentParams>;
  private _onDidOpen: Emitter<DidOpenTextDocumentParams>;
  private _onDidClose: Emitter<DidCloseTextDocumentParams>;
  private _onDidSave: Emitter<DidSaveTextDocumentParams>;

  constructor() {
    const events = container.resolve<IDocumentEvents>("DocumentEvents");
    this._onDidChange = new Emitter<DidChangeTextDocumentParams>();
    this._onDidOpen = new Emitter<DidOpenTextDocumentParams>();
    this._onDidClose = new Emitter<DidCloseTextDocumentParams>();
    this._onDidSave = new Emitter<DidSaveTextDocumentParams>();

    events.onDidOpen((params: DidOpenTextDocumentParams) => {
      const td = params.textDocument;
      const document = this._configuration.create(
        td.uri,
        td.languageId,
        td.version,
        td.text,
      );
      this._documents[params.textDocument.uri] = document;
      this._onDidOpen.fire(params);
    });

    events.onDidChange((params: DidChangeTextDocumentParams) => {
      const td = params.textDocument;
      const changes = params.contentChanges;
      if (changes.length === 0) {
        return;
      }

      let document = this._documents[td.uri];

      const { version } = td;
      if (version === null || version === void 0) {
        throw new Error(
          `Received document change event for ${td.uri} without valid version identifier`,
        );
      }

      document = this._configuration.update(document, changes, version);

      this._documents[td.uri] = document;

      this._onDidChange.fire(params);
    });

    events.onDidSave((params: DidSaveTextDocumentParams) => {
      const document = this._documents[params.textDocument.uri];
      if (document) {
        this._onDidSave.fire(params);
      }
    });

    events.onDidClose((params: DidCloseTextDocumentParams) => {
      const document = this._documents[params.textDocument.uri];
      if (document) {
        delete this._documents[params.textDocument.uri];
        this._onDidClose.fire(params);
      }
    });
  }

  public get onDidChange(): Event<DidChangeTextDocumentParams> {
    return this._onDidChange.event;
  }

  public get onDidOpen(): Event<DidOpenTextDocumentParams> {
    return this._onDidOpen.event;
  }

  public get onDidClose(): Event<DidCloseTextDocumentParams> {
    return this._onDidClose.event;
  }

  public get onDidSave(): Event<DidSaveTextDocumentParams> {
    return this._onDidSave.event;
  }

  /**
   * Returns the document for the given URI. Returns undefined if
   * the document is not managed by this instance.
   *
   * @param uri The text document's URI to retrieve.
   * @return the text document or `undefined`.
   */
  public get(uri: string): TextDocument | undefined {
    return this._documents[uri];
  }

  public getOpenUris(): string[] {
    return Object.keys(this._documents);
  }
}
