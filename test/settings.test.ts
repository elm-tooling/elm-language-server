import { IClientSettings, Settings } from "../src/common/util/settings.js";

describe("Settings", () => {
  it("detects diagnostic markup message support", () => {
    const settings = new Settings({} as IClientSettings, {
      textDocument: {
        diagnostic: { markupMessageSupport: true },
      },
    });

    expect(settings.isDiagnosticMarkupMessageSupported()).toBe(true);
  });

  it.each([{}, { textDocument: { diagnostic: {} } }])(
    "does not assume diagnostic markup message support",
    (clientCapabilities) => {
      const settings = new Settings({} as IClientSettings, clientCapabilities);

      expect(settings.isDiagnosticMarkupMessageSupported()).toBe(false);
    },
  );
});
