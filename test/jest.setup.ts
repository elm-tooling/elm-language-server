import "reflect-metadata";
import { container } from "tsyringe";
import { Connection } from "vscode-languageserver";
import { mockDeep } from "jest-mock-extended";
import { Settings } from "../src/util/settings";

container.register("Connection", { useValue: mockDeep<Connection>() });
container.register("ElmWorkspaces", { useValue: [] });
container.register("Settings", {
  useValue: new Settings({} as any, {}),
});
container.register("ClientSettings", {
  useValue: {},
});
