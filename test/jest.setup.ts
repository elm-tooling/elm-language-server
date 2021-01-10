import "reflect-metadata";
import { container } from "tsyringe";
import { Connection } from "vscode-languageserver";
import { mockDeep } from "jest-mock-extended";
import { IClientSettings, Settings } from "../src/util/settings";
import { DocumentEvents } from "../src/util/documentEvents";

container.register("Connection", { useValue: mockDeep<Connection>() });
container.register("ElmWorkspaces", { useValue: [] });
container.register("Settings", {
  useValue: new Settings(
    {
      // skip this code path, as mocking the promise from showInformationMessage is no fun
      useElmToolingJsonForTools: false,
    } as IClientSettings,
    {},
  ),
});
container.register("ClientSettings", {
  useValue: {},
});
container.registerSingleton("DocumentEvents", DocumentEvents);
