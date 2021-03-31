import { mockDeep } from "jest-mock-extended";
import { container } from "tsyringe";
import {
  CodeActionProvider,
  ICodeAction,
  IRefactorCodeAction,
} from "../../src/providers/codeActionProvider";
import Parser from "web-tree-sitter";

container.register<Parser>("Parser", {
  useValue: mockDeep<Parser>({
    getLanguage: () => ({
      query: () => {
        //
      },
    }),
  }),
});

class MockCodeActionsProvider extends CodeActionProvider {
  public isPreferredFix(
    action: ICodeAction | IRefactorCodeAction,
    allActions: (ICodeAction | IRefactorCodeAction)[],
  ): boolean {
    return super.isPreferredFix(action, allActions);
  }

  public static clearPreferredActions() {
    super.clearPreferredActions();
  }
}

describe("preferred code action tests", () => {
  beforeEach(() => MockCodeActionsProvider.clearPreferredActions());

  it("highest priority is set to preferred with code fixes", () => {
    MockCodeActionsProvider.registerCodeAction({
      fixId: "fix1",
      errorCodes: [],
      preferredAction: {
        priority: 1,
      },
      getCodeActions: () => [],
      getFixAllCodeAction: () => {
        return undefined;
      },
    });

    MockCodeActionsProvider.registerCodeAction({
      fixId: "fix2",
      errorCodes: [],
      preferredAction: {
        priority: 2,
      },
      getCodeActions: () => [],
      getFixAllCodeAction: () => {
        return undefined;
      },
    });

    MockCodeActionsProvider.registerCodeAction({
      fixId: "fix3",
      errorCodes: [],
      getCodeActions: () => [],
      getFixAllCodeAction: () => {
        return undefined;
      },
    });

    const mock = new MockCodeActionsProvider();

    const allActions: (ICodeAction | IRefactorCodeAction)[] = [
      { title: "Fix 1", data: { fixId: "fix1" } },
      { title: "Fix 2", data: { fixId: "fix2" } },
      { title: "Fix 3", data: { fixId: "fix3" } },
    ];

    expect(mock.isPreferredFix(allActions[0], allActions)).toBe(false);
    expect(mock.isPreferredFix(allActions[1], allActions)).toBe(true);
    expect(mock.isPreferredFix(allActions[2], allActions)).toBe(false);
  });

  it("highest priority is set to preferred with refactor actions", () => {
    MockCodeActionsProvider.registerCodeAction({
      fixId: "fix1",
      errorCodes: [],
      preferredAction: {
        priority: 0,
      },
      getCodeActions: () => [],
      getFixAllCodeAction: () => {
        return undefined;
      },
    });

    MockCodeActionsProvider.registerRefactorAction("refactor1", {
      preferredAction: {
        priority: 1,
      },
      getAvailableActions: () => [],
      getEditsForAction: () => ({}),
    });

    const mock = new MockCodeActionsProvider();

    const allActions: (ICodeAction | IRefactorCodeAction)[] = [
      { title: "Fix 1", data: { fixId: "fix1" } },
      { title: "Refactor 1", data: { fixId: "refactor1" } },
    ];

    expect(mock.isPreferredFix(allActions[0], allActions)).toBe(false);
    expect(mock.isPreferredFix(allActions[1], allActions)).toBe(true);
  });

  it("not preferred if no preference", () => {
    MockCodeActionsProvider.registerCodeAction({
      fixId: "fix1",
      errorCodes: [],
      getCodeActions: () => [],
      getFixAllCodeAction: () => {
        return undefined;
      },
    });

    MockCodeActionsProvider.registerCodeAction({
      fixId: "fix2",
      errorCodes: [],
      getCodeActions: () => [],
      getFixAllCodeAction: () => {
        return undefined;
      },
    });

    const mock = new MockCodeActionsProvider();

    const allActions: (ICodeAction | IRefactorCodeAction)[] = [
      { title: "Fix 1", data: { fixId: "fix1" } },
      { title: "Fix 2", data: { fixId: "fix2" } },
    ];

    expect(mock.isPreferredFix(allActions[0], allActions)).toBe(false);
    expect(mock.isPreferredFix(allActions[1], allActions)).toBe(false);
  });

  it("not marked as preferred when there can only be one", () => {
    MockCodeActionsProvider.registerCodeAction({
      fixId: "fix1",
      errorCodes: [],
      preferredAction: {
        priority: 1,
        thereCanOnlyBeOne: true,
      },
      getCodeActions: () => [],
      getFixAllCodeAction: () => {
        return undefined;
      },
    });

    const mock = new MockCodeActionsProvider();

    const allActions: (ICodeAction | IRefactorCodeAction)[] = [
      { title: "Fix 1", data: { fixId: "fix1" } },
      { title: "Fix 1 - Another", data: { fixId: "fix1" } },
    ];

    expect(mock.isPreferredFix(allActions[0], allActions)).toBe(false);
    expect(mock.isPreferredFix(allActions[1], allActions)).toBe(false);
  });
});
