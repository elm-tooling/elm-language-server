import { CodeActionParams, RequestType } from "vscode-languageserver";

export const GetMoveDestinationRequest = new RequestType<
  MoveParams,
  MoveDestinationsResponse,
  void,
  void
>("elm/getMoveDestinations");

export const MoveRequest = new RequestType<MoveParams, void, void, void>(
  "elm/move",
);

export interface MoveParams {
  sourceUri: string;
  params: CodeActionParams;
  destination?: MoveDestination;
}

export interface MoveDestinationsResponse {
  destinations: MoveDestination[];
}

export interface MoveDestination {
  name: string;
  path: string;
  uri: string;
}

export const ExposeRequest = new RequestType<
  ExposeUnexposeParams,
  void,
  void,
  void
>("elm/expose");

export interface ExposeUnexposeParams {
  uri: string;
  name: string;
}

export const UnexposeRequest = new RequestType<
  ExposeUnexposeParams,
  void,
  void,
  void
>("elm/unexpose");
