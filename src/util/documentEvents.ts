import { EventEmitter } from "events";
import {
  Connection,
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentParams,
} from "vscode-languageserver";
import { URI } from "vscode-uri";

type DidChangeCallback = (params: DidChangeTextDocumentParams) => void;
type DidCloseCallback = (params: DidCloseTextDocumentParams) => void;
type DidOpenCallback = (params: DidOpenTextDocumentParams) => void;
type DidSaveCallback = (params: DidSaveTextDocumentParams) => void;

export interface IDocumentEvents {
  on(event: "change", listener: DidChangeCallback): this;
  on(event: "close", listener: DidCloseCallback): this;
  on(event: "open", listener: DidOpenCallback): this;
  on(event: "save", listener: DidSaveCallback): this;
}

export class DocumentEvents extends EventEmitter implements IDocumentEvents {
  constructor(connection: Connection, elmWorkspace: URI) {
    super();

    connection.onDidChangeTextDocument(event =>
      this.emitForWorkspace(event, elmWorkspace, "change"),
    );
    connection.onDidCloseTextDocument(event =>
      this.emitForWorkspace(event, elmWorkspace, "close"),
    );
    connection.onDidOpenTextDocument(event =>
      this.emitForWorkspace(event, elmWorkspace, "open"),
    );
    connection.onDidSaveTextDocument(event =>
      this.emitForWorkspace(event, elmWorkspace, "save"),
    );
  }

  private emitForWorkspace(event: any, elmWorkspace: URI, eventType: string) {
    if (event.textDocument.uri.startsWith(elmWorkspace.toString())) {
      this.emit(eventType, event);
    }
  }
}
