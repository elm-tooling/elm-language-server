import { EventEmitter } from "events";
import {
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentParams,
} from "vscode-languageserver";
import {
  TextDocumentContentChangeEvent,
  TextDocument,
} from "vscode-languageserver-textdocument";
import { IDocumentEvents } from "./documentEvents";

type DidChangeCallback = (document: TextDocument) => void;
type DidCloseCallback = (document: TextDocument) => void;
type DidOpenCallback = (document: TextDocument) => void;
type DidSaveCallback = (document: TextDocument) => void;

export interface ITextDocumentEvents {
  on(event: "change", listener: DidChangeCallback): this;
  on(event: "close", listener: DidCloseCallback): this;
  on(event: "open", listener: DidOpenCallback): this;
  on(event: "save", listener: DidSaveCallback): this;
}

interface IUpdatableDocument extends TextDocument {
  update(event: TextDocumentContentChangeEvent, version: number): void;
}

// This is loosely based on https://github.com/Microsoft/vscode-languageserver-node/blob/73180893ca/server/src/main.ts#L124
// With some simplifications and the ability to support multiple listeners
export class TextDocumentEvents extends EventEmitter
  implements ITextDocumentEvents {
  public static isUpdatableDocument(
    value: TextDocument,
  ): value is IUpdatableDocument {
    return typeof (value as IUpdatableDocument).update === "function";
  }

  // a single store of documents shared by all workspaces
  private documents: { [uri: string]: TextDocument };

  constructor(events: IDocumentEvents) {
    super();
    this.documents = {};

    events.on("open", (params: DidOpenTextDocumentParams) => {
      const td = params.textDocument;
      const document = TextDocument.create(
        td.uri,
        td.languageId,
        td.version,
        td.text,
      );
      this.documents[params.textDocument.uri] = document;
      const frozen = Object.freeze({ document });
      this.emit("open", frozen.document);
    });

    events.on("change", (params: DidChangeTextDocumentParams) => {
      const td = params.textDocument;
      const changes = params.contentChanges;
      const last: TextDocumentContentChangeEvent | undefined =
        changes.length > 0 ? changes[changes.length - 1] : undefined;
      if (last) {
        const document = this.documents[td.uri];
        if (document && TextDocumentEvents.isUpdatableDocument(document)) {
          if (td.version === null || td.version === void 0) {
            throw new Error(
              `Received document change event for ${td.uri} without valid version identifier`,
            );
          }
          document.update(last, td.version);
          const frozen = Object.freeze({ document });
          this.emit("change", frozen.document);
        }
      }
    });
    events.on("save", (params: DidSaveTextDocumentParams) => {
      const document = this.documents[params.textDocument.uri];
      if (document) {
        const frozen = Object.freeze({ document });
        this.emit("save", frozen.document);
      }
    });
    events.on("close", (params: DidCloseTextDocumentParams) => {
      const document = this.documents[params.textDocument.uri];
      if (document) {
        delete this.documents[params.textDocument.uri];
        const frozen = Object.freeze({ document });
        this.emit("close", frozen.document);
      }
    });
  }

  /**
   * Returns the document for the given URI. Returns undefined if
   * the document is not managed by this instance.
   *
   * @param uri The text document's URI to retrieve.
   * @return the text document or `undefined`.
   */
  public get(uri: string): TextDocument | undefined {
    return this.documents[uri];
  }
}
