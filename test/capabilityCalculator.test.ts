import { CapabilityCalculator } from "../src/common/capabilityCalculator.js";

describe("CapabilityCalculator", () => {
  it("advertises virtual document content to supporting clients", () => {
    const capabilities = new CapabilityCalculator({
      workspace: { textDocumentContent: {} },
    }).capabilities;

    expect(capabilities.workspace?.textDocumentContent).toEqual({
      schemes: ["elm-virtual-file"],
    });
  });

  it("does not advertise virtual document content to other clients", () => {
    const capabilities = new CapabilityCalculator({}).capabilities;

    expect(capabilities.workspace?.textDocumentContent).toBeUndefined();
  });
});
