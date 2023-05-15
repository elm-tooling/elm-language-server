import {
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentParams,
  Connection,
  Emitter,
  Event,
} from "vscode-languageserver";
import { injectable, container } from "tsyringe";

export interface IDocumentEvents {
  onDidChange: Event<DidChangeTextDocumentParams>;
  onDidOpen: Event<DidOpenTextDocumentParams>;
  onDidClose: Event<DidCloseTextDocumentParams>;
  onDidSave: Event<DidSaveTextDocumentParams>;
}

@injectable()
export class DocumentEvents implements IDocumentEvents {
  private _onDidChange: Emitter<DidChangeTextDocumentParams>;
  private _onDidOpen: Emitter<DidOpenTextDocumentParams>;
  private _onDidClose: Emitter<DidCloseTextDocumentParams>;
  private _onDidSave: Emitter<DidSaveTextDocumentParams>;

  constructor() {
    const connection = container.resolve<Connection>("Connection");
    this._onDidChange = new Emitter<DidChangeTextDocumentParams>();
    this._onDidOpen = new Emitter<DidOpenTextDocumentParams>();
    this._onDidClose = new Emitter<DidCloseTextDocumentParams>();
    this._onDidSave = new Emitter<DidSaveTextDocumentParams>();

    connection.onDidChangeTextDocument((e) => {
      this._onDidChange.fire(e);
    });
    connection.onDidCloseTextDocument((e) => {
      this._onDidClose.fire(e);
    });
    connection.onDidOpenTextDocument((e) => {
      this._onDidOpen.fire(e);
    });
    connection.onDidSaveTextDocument((e) => {
      this._onDidSave.fire(e);
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
}
