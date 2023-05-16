import "reflect-metadata";
import { container } from "tsyringe";
import { Connection } from "vscode-languageserver";
import { mockDeep } from "jest-mock-extended";
import { Settings } from "../src/common/util/settings";
import { DocumentEvents } from "../src/common/util/documentEvents";
import {
  IElmAnalyseJsonService,
  IElmAnalyseJson,
} from "../src/common/providers/diagnostics/elmAnalyseJsonService";
import {
  ElmMakeDiagnostics,
  ElmReviewDiagnostics,
} from "../src/common/providers";
import { createTestNodeFileSystemHost } from "./utils/sourceTreeParser";

container.register("Connection", { useValue: mockDeep<Connection>() });
container.register("ElmWorkspaces", { useValue: [] });
container.register("Settings", {
  useValue: new Settings({} as never, {}),
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
container.register(ElmMakeDiagnostics, {
  useValue: new ElmMakeDiagnostics(createTestNodeFileSystemHost()),
});

container.register(ElmReviewDiagnostics, {
  useValue: new ElmReviewDiagnostics(createTestNodeFileSystemHost()),
});
