import {
  CodeActionParams,
  CodeLens,
  CodeLensParams,
  CompletionParams,
  DidChangeTextDocumentParams,
  DidOpenTextDocumentParams,
  DocumentFormattingParams,
  DocumentSymbolParams,
  FileCreate,
  FileDelete,
  FileRename,
  FoldingRangeParams,
  PrepareRenameParams,
  ReferenceParams,
  RenameParams,
  SelectionRangeParams,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { IParams } from "../util/elmWorkspaceMatcher";

export type ITextDocumentPositionParams = TextDocumentPositionParams & IParams;
export type ICodeActionParams = CodeActionParams & IParams;
export type ICompletionParams = CompletionParams & IParams;
export type IDocumentSymbolParams = DocumentSymbolParams & IParams;
export type IFoldingRangeParams = FoldingRangeParams & IParams;
export type IReferenceParams = ReferenceParams & IParams;
export type IPrepareRenameParams = PrepareRenameParams & IParams;
export type IRenameParams = RenameParams & IParams;
export type ISelectionRangeParams = SelectionRangeParams & IParams;
export type ICodeLensParams = CodeLensParams & IParams;
export type ICodeLens = CodeLens & IParams;
export type IDocumentFormattingParams = DocumentFormattingParams & IParams;
export type IDidChangeTextDocumentParams = DidChangeTextDocumentParams &
  IParams;
export type IDidOpenTextDocumentParams = DidOpenTextDocumentParams & IParams;
export type ICreateFileParams = FileCreate & IParams;
export type IRenameFileParams = FileRename & IParams;
export type IDeleteFileParams = FileDelete & IParams;
