import { CapabilityCalculator } from "../src/common/capabilityCalculator.js";
import { CodeActionKind } from "vscode-languageserver";

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

  it("advertises supported code action kinds", () => {
    const capabilities = new CapabilityCalculator({}).capabilities;

    expect(capabilities.codeActionProvider).toEqual({
      resolveProvider: true,
      codeActionKinds: [
        CodeActionKind.QuickFix,
        CodeActionKind.Refactor,
        CodeActionKind.RefactorExtract,
        CodeActionKind.RefactorMove,
      ],
    });
  });

  it("advertises type definition support", () => {
    const capabilities = new CapabilityCalculator({}).capabilities;

    expect(capabilities.typeDefinitionProvider).toBe(true);
  });
});
