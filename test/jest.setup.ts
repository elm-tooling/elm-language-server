import "reflect-metadata";
import { container } from "tsyringe";
import { Connection } from "vscode-languageserver";
import { mockDeep } from "jest-mock-extended";
import { Settings } from "../src/util/settings";
import { DocumentEvents } from "../src/util/documentEvents";
import {
  IElmAnalyseJsonService,
  IElmAnalyseJson,
} from "../src/providers/diagnostics/elmAnalyseJsonService";

container.register("Connection", { useValue: mockDeep<Connection>() });
container.register("ElmWorkspaces", { useValue: [] });
container.register("ElmToolingJsonManager", {
  useValue: {},
});
container.register("Settings", {
  useValue: new Settings({} as any, {}),
});
container.register("ClientSettings", {
  useValue: {},
});
container.registerSingleton("DocumentEvents", DocumentEvents);
container.registerSingleton<IElmAnalyseJsonService>(
  "ElmAnalyseJsonService",
  class ElmAnalyseJsonHelperFixed implements IElmAnalyseJsonService {
    public getElmAnalyseJson(workspacePath: string): IElmAnalyseJson {
      return { checks: { SingleFieldRecord: true } };
    }
  },
);
