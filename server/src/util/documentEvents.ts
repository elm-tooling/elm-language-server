import { EventEmitter } from 'events';
import {
  Connection,
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentParams,
} from 'vscode-languageserver';

type DidChangeCallback = ((params: DidChangeTextDocumentParams) => void)
type DidCloseCallback = ((params: DidCloseTextDocumentParams) => void)
type DidOpenCallback = ((params: DidOpenTextDocumentParams) => void)
type DidSaveCallback = ((params: DidSaveTextDocumentParams) => void)

export interface IDocumentEvents{
  on(event: 'change', listener: DidChangeCallback): this;
  on(event: 'close', listener: DidCloseCallback): this;
  on(event: 'open', listener: DidOpenCallback): this;
  on(event: 'save', listener: DidSaveCallback): this;
}

export class DocumentEvents extends EventEmitter implements IDocumentEvents {
  constructor(connection: Connection) {
    super();

    connection.onDidChangeTextDocument(event => this.emit("change", event))
    connection.onDidCloseTextDocument(event => this.emit("close", event))
    connection.onDidOpenTextDocument(event => this.emit("open", event))
    connection.onDidSaveTextDocument(event => this.emit("save", event))
  }
}
