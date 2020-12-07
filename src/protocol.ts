import { CodeActionParams, RequestType } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { IParams } from "./util/elmWorkspaceMatcher";

// eslint-disable-next-line @typescript-eslint/no-namespace
export const GetMoveDestinationRequest = new RequestType<
  IMoveParams,
  IMoveDestinationsResponse,
  void
>("elm/getMoveDestinations");

export const MoveRequest = new RequestType<IMoveParams, void, void>("elm/move");

export interface IMoveParams extends IParams {
  sourceUri: string;
  params: CodeActionParams;
  destination?: IMoveDestination;
}

export interface IMoveDestinationsResponse {
  destinations: IMoveDestination[];
}

export interface IMoveDestination {
  name: string;
  path: string;
  uri: string;
}

export const ExposeRequest = new RequestType<IExposeUnexposeParams, void, void>(
  "elm/expose",
);

export interface IExposeUnexposeParams extends IParams {
  uri: string;
  name: string;
}

export const UnexposeRequest = new RequestType<
  IExposeUnexposeParams,
  void,
  void
>("elm/unexpose");

export interface IOnDidCreateFilesParams {
  readonly files: ReadonlyArray<URI>;
}

export interface IOnDidRenameFilesParams {
  readonly files: ReadonlyArray<{ oldUri: URI; newUri: URI }>;
}

export const OnDidCreateFilesRequest = new RequestType<
  IOnDidCreateFilesParams,
  void,
  void
>("elm/ondidCreateFiles");

export const OnDidRenameFilesRequest = new RequestType<
  IOnDidRenameFilesParams,
  void,
  void
>("elm/ondidRenameFiles");

export interface IGetDiagnosticsParams {
  files: string[];
  delay: number;
}

export const GetDiagnosticsRequest = new RequestType<
  IGetDiagnosticsParams,
  void,
  void
>("elm/getDiagnostics");
