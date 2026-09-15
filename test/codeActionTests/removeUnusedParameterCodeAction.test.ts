import { testCodeAction } from "./codeActionTestBase.js";

const title = "Remove unused parameter `unused`";

describe("remove unused parameter", () => {
  it.each([
    [
      "unused x y",
      "Int -> String -> Bool -> String",
      '1 "x" True',
      "x y",
      "String -> Bool -> String",
      '"x" True',
    ],
    [
      "x unused y",
      "String -> Int -> Bool -> String",
      '"x" 1 True',
      "x y",
      "String -> Bool -> String",
      '"x" True',
    ],
    [
      "x y unused",
      "String -> Bool -> Int -> String",
      '"x" True 1',
      "x y",
      "String -> Bool -> String",
      '"x" True',
    ],
  ])(
    "removes from %s and its annotation and calls",
    async (args, type, call, newArgs, newType, newCall) => {
      const source = `
--@ Test.elm
module Test exposing (..)

foo : ${type}
foo ${args} = if y then x else x
${" ".repeat(4 + args.indexOf("unused"))}--^

result = foo ${call}
`;
      await testCodeAction(
        source,
        [{ title }],
        `
--@ Test.elm
module Test exposing (..)

foo : ${newType}
foo ${newArgs} = if y then x else x

result = foo ${newCall}
`,
      );
      const actions = await testCodeAction(source, [
        { title: "Fix unused pattern `unused`" },
      ]);
      expect(actions.some((action) => action.title === title)).toBe(true);
    },
  );

  it("removes the sole parameter, including nested calls", async () => {
    await testCodeAction(
      `
--@ Test.elm
module Test exposing (..)

foo : Int -> Int
foo unused = 1
    --^

result = foo (foo 2)
`,
      [{ title }],
      `
--@ Test.elm
module Test exposing (..)

foo : Int
foo = 1

result = foo
`,
    );
  });

  it("updates qualified and exposed cross-file calls", async () => {
    const actions = await testCodeAction(
      `
--@ Test.elm
module Test exposing (foo)

foo unused x = x
    --^

--@ Other.elm
module Other exposing (..)
import Test as T exposing (foo)

one = T.foo 1 2
two = foo 3 4
`,
      [{ title }],
      `
--@ Test.elm
module Test exposing (foo)

foo x = x

--@ Other.elm
module Other exposing (..)
import Test as T exposing (foo)

one = T.foo 2
two = foo 4
`,
    );
    expect(
      Object.keys(
        actions.find((action) => action.title === title)?.edit?.changes ?? {},
      ),
    ).toHaveLength(2);
  });

  it("supports partial applications after the removed argument and parenthesized targets", async () => {
    await testCodeAction(
      `
--@ Test.elm
module Test exposing (..)

foo unused x = x
    --^

partial = (foo) 1
result = 2 |> foo 3
higherOrder = (\\f -> f 2) (foo 4)
`,
      [{ title }],
      `
--@ Test.elm
module Test exposing (..)

foo x = x

partial = (foo)
result = 2 |> foo
higherOrder = (\\f -> f 2) (foo)
`,
    );
  });

  it("handles let functions without changing unrelated same-name functions", async () => {
    await testCodeAction(
      `
--@ Test.elm
module Test exposing (..)

result =
    let
        foo unused x = x
            --^
    in
    foo 1 2

other =
    let
        foo a b = a + b
    in
    foo 3 4
`,
      [{ title }],
      `
--@ Test.elm
module Test exposing (..)

result =
    let
        foo x = x
    in
    foo 2

other =
    let
        foo a b = a + b
    in
    foo 3 4
`,
    );
  });

  it("preserves parentheses around function types and multiline arguments", async () => {
    await testCodeAction(
      `
--@ Test.elm
module Test exposing (..)

foo : (Int -> Int) -> Int -> Int
foo unused x = x
    --^

result =
    foo
        (\\x -> x)
        2
`,
      [{ title }],
      `
--@ Test.elm
module Test exposing (..)

foo : Int -> Int
foo x = x

result =
    foo
        2
`,
    );
  });

  it("updates recursive calls when a parameter remains", async () => {
    await testCodeAction(
      `
--@ Test.elm
module Test exposing (..)

foo unused x = if x == 0 then x else foo 2 0
    --^

result = foo 1 3
`,
      [{ title }],
      `
--@ Test.elm
module Test exposing (..)

foo x = if x == 0 then x else foo 0

result = foo 3
`,
    );
  });

  it("counts parenthesized patterns as one preceding parameter", async () => {
    await testCodeAction(
      `
--@ Test.elm
module Test exposing (..)

foo : Maybe Int -> Int -> Int
foo (Just x) unused = x
             --^

result = foo (Just 1) 2
`,
      [{ title }],
      `
--@ Test.elm
module Test exposing (..)

foo : Maybe Int -> Int
foo (Just x) = x

result = foo (Just 1)
`,
    );
  });

  it("preserves argument comments", async () => {
    await testCodeAction(
      `
--@ Test.elm
module Test exposing (..)

foo {- parameter -} unused x = x
                   --^

result = foo {- argument -} 1 2
`,
      [{ title }],
      `
--@ Test.elm
module Test exposing (..)

foo {- parameter -}  x = x

result = foo {- argument -}  2
`,
    );
  });

  it("refuses indirect recursion when removing the last parameter", async () => {
    const actions = await testCodeAction(
      `
--@ Test.elm
module Test exposing (..)

foo unused = bar 1
    --^

bar x = foo x
`,
      [{ title: "Fix unused pattern `unused`" }],
    );
    expect(actions.some((action) => action.title === title)).toBe(false);
  });

  it.each([
    "foo : FunctionAlias\nfoo unused x = x",
    "main unused = 1",
    "infix left 5 (<?>) = foo\nfoo unused x = x",
  ])(
    "refuses signatures or entry points it cannot safely update: %s",
    async (declaration) => {
      const actions = await testCodeAction(
        `
--@ Test.elm
module Test exposing (..)

${declaration}
     --^

result = foo 1 2
`,
        [{ title: "Fix unused pattern `unused`" }],
      );
      expect(actions.some((action) => action.title === title)).toBe(false);
    },
  );

  it.each([
    "read-only caller",
    "public package API",
    "unresolved reference",
    "parse error",
  ])("refuses %s", async (reason) => {
    const actions = await testCodeAction(
      `
--@ Test.elm
module Test exposing (foo)

foo unused x = x
    --^

--@ Other.elm
module Other exposing (..)
import Test

result = ${reason === "unresolved reference" ? "Unknown.foo 1 2" : reason === "parse error" ? "Test.foo (" : "Test.foo 1 2"}
`,
      [{ title: "Fix unused pattern `unused`" }],
      undefined,
      {
        configureProgram: (program) => {
          for (const file of program.getSourceFiles()) {
            if (
              reason === "read-only caller" &&
              file.uri.endsWith("/Other.elm")
            ) {
              file.writeable = false;
            }
            if (
              reason === "public package API" &&
              file.uri.endsWith("/Test.elm")
            ) {
              file.project = {
                ...file.project,
                type: "package",
                exposedModules: new Set(["Test"]),
                maintainerAndPackageName: "test/package",
                isDependency: false,
              };
            }
          }
        },
      },
    );
    expect(actions.some((action) => action.title === title)).toBe(false);
  });

  it.each([
    "foo",
    "[foo]",
    "List.map foo []",
    "1 |> foo",
    "foo <| 1",
    "foo >> identity",
    "(\\f -> f 1 2) foo",
  ])("refuses a use with unknown consumers: %s", async (use) => {
    const actions = await testCodeAction(
      `
--@ Test.elm
module Test exposing (..)

foo unused x = x
    --^

result = ${use}
`,
      [{ title: "Fix unused pattern `unused`" }],
    );
    expect(actions.some((action) => action.title === title)).toBe(false);
  });

  it("refuses partial application before the unused argument", async () => {
    const actions = await testCodeAction(
      `
--@ Test.elm
module Test exposing (..)

foo x unused = x
      --^

result = foo 1
`,
      [{ title: "Fix unused pattern `unused`" }],
    );
    expect(actions.some((action) => action.title === title)).toBe(false);
  });

  it("refuses unknown uses in another file", async () => {
    const actions = await testCodeAction(
      `
--@ Test.elm
module Test exposing (foo)

foo unused x = x
    --^

--@ Other.elm
module Other exposing (..)
import Test

result = Test.foo
`,
      [{ title: "Fix unused pattern `unused`" }],
    );
    expect(actions.some((action) => action.title === title)).toBe(false);
  });

  it("refuses to turn recursive functions into recursive values", async () => {
    const actions = await testCodeAction(
      `
--@ Test.elm
module Test exposing (..)

foo unused = foo 1
    --^
`,
      [{ title: "Fix unused pattern `unused`" }],
    );
    expect(actions.some((action) => action.title === title)).toBe(false);
  });

  it.each([
    ["foo (unused, x) = x", 5],
    ["foo { unused } = 1", 6],
    ["foo = \\unused -> 1", 7],
    ["foo x = case x of\n    Just unused -> 1\n    Nothing -> 0", 9],
  ])(
    "does not remove a nested pattern or lambda parameter: %s",
    async (declaration, column) => {
      const lines = declaration.split("\n");
      const target = lines.findIndex((line) => line.includes("unused"));
      lines.splice(target + 1, 0, `${" ".repeat(column)}--^`);
      const actions = await testCodeAction(
        `
--@ Test.elm
module Test exposing (..)

${lines.join("\n")}
`,
        declaration.startsWith("foo (unused,")
          ? []
          : [{ title: "Fix unused pattern `unused`" }],
      );
      expect(actions.some((action) => action.title === title)).toBe(false);
    },
  );
});
