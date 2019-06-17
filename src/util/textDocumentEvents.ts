import {
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentParams,
  TextDocument,
  TextDocumentContentChangeEvent,
} from "vscode-languageserver";
import { EventEmitter } from "ws";
import { DocumentEvents } from "./documentEvents";

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

interface IUpdateableDocument extends TextDocument {
  update(event: TextDocumentContentChangeEvent, version: number): void;
}

// This is loosely based on https://github.com/Microsoft/vscode-languageserver-node/blob/73180893ca/server/src/main.ts#L124
// With some simplifications and the ability to support multiple listeners
export class TextDocumentEvents extends EventEmitter
  implements ITextDocumentEvents {
  public static isUpdateableDocument(
    value: TextDocument,
  ): value is IUpdateableDocument {
    return typeof (value as IUpdateableDocument).update === "function";
  }

  private documents: { [uri: string]: TextDocument };

  constructor(events: DocumentEvents) {
    super();
    this.documents = {};

    events.on("open", (event: DidOpenTextDocumentParams) => {
      const td = event.textDocument;
      const document = TextDocument.create(
        td.uri,
        td.languageId,
        td.version,
        td.text,
      );
      this.documents[event.textDocument.uri] = document;
      const frozen = Object.freeze({ document });
      this.emit("open", frozen.document);
    });

    events.on("change", (event: DidChangeTextDocumentParams) => {
      const td = event.textDocument;
      const changes = event.contentChanges;
      const last: TextDocumentContentChangeEvent | undefined =
        changes.length > 0 ? changes[changes.length - 1] : undefined;
      if (last) {
        const document = this.documents[td.uri];
        if (document && TextDocumentEvents.isUpdateableDocument(document)) {
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
    events.on("save", (event: DidSaveTextDocumentParams) => {
      const document = this.documents[event.textDocument.uri];
      if (document) {
        const frozen = Object.freeze({ document });
        this.emit("save", frozen.document);
      }
    });
    events.on("close", (event: DidCloseTextDocumentParams) => {
      const document = this.documents[event.textDocument.uri];
      if (document) {
        delete this.documents[event.textDocument.uri];
        const frozen = Object.freeze({ document });
        this.emit("close", frozen.document);
      }
    });
  }

  /**
   * Returns the document for the given URI. Returns undefined if
   * the document is not mananged by this instance.
   *
   * @param uri The text document's URI to retrieve.
   * @return the text document or `undefined`.
   */
  public get(uri: string): TextDocument | undefined {
    return this.documents[uri];
  }
}
