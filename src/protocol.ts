import { CodeActionParams, RequestType } from "vscode-languageserver";

export const GetMoveDestinationRequest = new RequestType<
  IMoveParams,
  IMoveDestinationsResponse,
  void,
  void
>("elm/getMoveDestinations");

export const MoveRequest = new RequestType<IMoveParams, void, void, void>(
  "elm/move",
);

export interface IMoveParams {
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

export const ExposeRequest = new RequestType<
  IExposeUnexposeParams,
  void,
  void,
  void
>("elm/expose");

export interface IExposeUnexposeParams {
  uri: string;
  name: string;
}

export const UnexposeRequest = new RequestType<
  IExposeUnexposeParams,
  void,
  void,
  void
>("elm/unexpose");
