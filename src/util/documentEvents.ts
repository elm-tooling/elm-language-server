import { EventEmitter } from "events";
import {
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentParams,
  IConnection,
} from "vscode-languageserver";
import { injectable, container } from "tsyringe";

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

@injectable()
export class DocumentEvents extends EventEmitter implements IDocumentEvents {
  constructor() {
    const connection = container.resolve<IConnection>("Connection");
    super();

    connection.onDidChangeTextDocument((e) => this.emit("change", e));
    connection.onDidCloseTextDocument((e) => this.emit("close", e));
    connection.onDidOpenTextDocument((e) => this.emit("open", e));
    connection.onDidSaveTextDocument((e) => this.emit("save", e));
  }
}
