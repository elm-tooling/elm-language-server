import { container } from "tsyringe";
import { mockDeep, type DeepMockProxy } from "jest-mock-extended";
import type { Connection } from "vscode-languageserver";
import { ElmAnalyseJsonService } from "../src/common/providers/diagnostics/elmAnalyseJsonService.js";
import type { IFileSystemHost } from "../src/common/types.js";

describe("ElmAnalyseJsonService", () => {
  let connection: DeepMockProxy<Connection>;
  let host: DeepMockProxy<IFileSystemHost>;

  beforeEach(() => {
    connection = mockDeep<Connection>();
    host = mockDeep<IFileSystemHost>();
    container.register("Connection", { useValue: connection });
  });

  it("reads and caches elm-analyse.json", () => {
    host.readFileSync.mockReturnValue(
      JSON.stringify({ checks: { UnusedImport: false } }),
    );
    const service = new ElmAnalyseJsonService(host);

    expect(service.getElmAnalyseJson("/workspace")).toEqual({
      checks: { UnusedImport: false },
    });
    expect(service.getElmAnalyseJson("/workspace")).toEqual({
      checks: { UnusedImport: false },
    });
    expect(host.readFileSync).toHaveBeenCalledTimes(1);
  });

  it("enables all checks when elm-analyse.json is missing", () => {
    host.readFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const service = new ElmAnalyseJsonService(host);

    expect(service.getElmAnalyseJson("/workspace")).toEqual({});
    expect(connection.console.info).toHaveBeenCalledWith(
      "No elm-analyse.json found, enabling all diagnostic checks.",
    );
  });

  it("enables all checks when elm-analyse.json is malformed", () => {
    host.readFileSync.mockReturnValue("not json");
    const service = new ElmAnalyseJsonService(host);

    expect(service.getElmAnalyseJson("/workspace")).toEqual({});
    expect(connection.console.info).toHaveBeenCalledWith(
      "No elm-analyse.json found, enabling all diagnostic checks.",
    );
  });
});
