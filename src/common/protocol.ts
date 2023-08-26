import { CodeActionParams, RequestType } from "vscode-languageserver";
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

export interface IGetDiagnosticsParams {
  files: string[];
  delay: number;
}

export const GetDiagnosticsRequest = new RequestType<
  IGetDiagnosticsParams,
  void,
  void
>("elm/getDiagnostics");

export const FindTestsRequest = new RequestType<
  IFindTestsParams,
  IFindTestsResponse,
  void
>("elm/findTests");

export interface IFindTestsParams {
  projectFolder: string;
}

export interface IFindTestsResponse {
  suites?: TestSuite[];
}

export type TestSuite = {
  label: string;
  tests?: TestSuite[];
  file: string;
  position: { line: number; character: number };
};

export const ReadFileRequest = new RequestType<string, number[], void>(
  "elm/readFile",
);

export const ReadDirectoryRequest = new RequestType<string, string[], void>(
  "elm/readDirectory",
);

export const ProvideFileContentsRequest = new RequestType<
  { uri: string },
  string,
  void
>("elm/provideFileContents");
