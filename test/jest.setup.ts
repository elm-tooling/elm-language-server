import "reflect-metadata";
import { container } from "tsyringe";
import { Connection } from "vscode-languageserver";
import { mockDeep } from "jest-mock-extended";
import { Settings } from "../src/common/util/settings.js";
import { DocumentEvents } from "../src/common/util/documentEvents.js";
import {
  IElmAnalyseJsonService,
  IElmAnalyseJson,
} from "../src/common/providers/diagnostics/elmAnalyseJsonService.js";
import {
  ASTProvider,
  ElmMakeDiagnostics,
  ElmReviewDiagnostics,
} from "../src/common/providers/index.js";
import { createTestNodeFileSystemHost } from "./utils/sourceTreeParser.js";

container.register("Connection", { useValue: mockDeep<Connection>() });
container.register("ElmWorkspaces", { useValue: [] });
container.register("Settings", {
  useValue: new Settings({} as never, {}),
});
container.register("ClientSettings", {
  useValue: {},
});
container.register(ASTProvider, {
  useValue: mockDeep<ASTProvider>({
    onTreeChange: () => ({ dispose: () => {} }),
    onTreeDelete: () => ({ dispose: () => {} }),
  }),
});
container.registerSingleton("DocumentEvents", DocumentEvents);
container.registerSingleton<IElmAnalyseJsonService>(
  "ElmAnalyseJsonService",
  class ElmAnalyseJsonHelperFixed implements IElmAnalyseJsonService {
    public getElmAnalyseJson(workspacePath: string): IElmAnalyseJson {
      return { checks: { SingleFieldRecord: true } };
    }
    public isFileExcluded(fileUri: string, workspacePath: string): boolean {
      return false;
    }
  },
);
container.register(ElmMakeDiagnostics, {
  useValue: new ElmMakeDiagnostics(createTestNodeFileSystemHost()),
});

container.register(ElmReviewDiagnostics, {
  useValue: new ElmReviewDiagnostics(createTestNodeFileSystemHost()),
});
