import { DefinitionProviderTestBase } from "./definitionProviderTestBase";

describe("typeResolveDefinition", () => {
  const testBase = new DefinitionProviderTestBase();

  it(`test union type ref`, async () => {
    const source = `
type Page = Home
--X
title : Page -> String
        --^
`;
    await testBase.testDefinition(source);
  });

  it(`test union type ref from module exposing list`, async () => {
    const source = `
module Main exposing (Page)
                      --^
type Page = Home
--X
`;
    await testBase.testDefinition(source);
  });

  it(`test union constructor ref`, async () => {
    const source = `
type Page = Home
            --X
defaultPage = Home
              --^
`;
    await testBase.testDefinition(source);
  });

  it(`test union constructor pattern matching`, async () => {
    const source = `
type Page = Home
            --X
title page =
    case page of
        Home -> "home"
        --^
`;
    await testBase.testDefinition(source);
  });

  it(`test type alias ref from module exposing list`, async () => {
    const source = `
module Main exposing (Person)
                      --^
type alias Person = { name : String, age: Int }
--X
`;
    await testBase.testDefinition(source);
  });

  it(`test type alias ref in type annotation`, async () => {
    const source = `
type alias Person = { name : String, age: Int }
--X
personToString : Person -> String
                 --^
`;
    await testBase.testDefinition(source);
  });

  it(`test type alias record constructor ref`, async () => {
    const source = `
type alias Person = { name : String, age: Int }
--X
defaultPerson = Person "George" 42
                --^
`;
    await testBase.testDefinition(source);
  });

  it(`test parametric union type ref `, async () => {
    const source = `
type Page a = Home a
--X
title : Page a -> String
        --^
`;
    await testBase.testDefinition(source);
  });

  it(`test parametric type alias ref `, async () => {
    const source = `
type alias Person a = { name : String, extra : a }
--X
title : Person a -> String
        --^
`;
    await testBase.testDefinition(source);
  });

  it(`test union constructor ref should not resolve to a record constructor`, async () => {
    const source = `
type alias User = { name : String, age : Int }

foo user =
  case user of
    User -> "foo"
    --^unresolved
    `;
    await testBase.testDefinition(source);
  });

  it(`test union constructor ref should not resolve to a type`, async () => {
    const source = `
type User = GroupA

foo user =
  case user of
    User -> "foo"
    --^unresolved
    `;
    await testBase.testDefinition(source);
  });

  it(`test variable in union type`, async () => {
    const source = `
type Page a = Home a
        --X      --^
`;
    await testBase.testDefinition(source);
  });

  it(`test variable in a record type alias`, async () => {
    const source = `
type alias User details = { name : String, extra : details }
                --X                                --^
`;
    await testBase.testDefinition(source);
  });

  it(`test union constructor should not resolve to type declaration`, async () => {
    const source = `
type User = User { data : String }
            --X
func: User
func =
    User { data = "" }
   --^
`;
    await testBase.testDefinition(source);
  });

  it(`test type declaration should not resolve to union constructor`, async () => {
    const source = `
type User = User { data : String }
--X

func: User
    --^
func =
User { data = "" }
`;
    await testBase.testDefinition(source);
  });

  it(`test type declaration resolves to itself`, async () => {
    const source = `
  type UnitlessFloat
  --X   --^
    = UnitlessFloat
`;
    await testBase.testDefinition(source);
  });

  it(`test union contructor resolves to itself`, async () => {
    const source = `
  type UnitlessFloat
  = UnitlessFloat
    --X   --^
`;
    await testBase.testDefinition(source);
  });

  it(`test union constructor resolves when used as function parameter`, async () => {
    const source = `
--@ main.elm

type Page = 
    Home
   --X

func = 
    Just Home
        --^
`;
    await testBase.testDefinition(source);
  });

  it(`test union constructor resolves when used in a bin op expr`, async () => {
    const source = `
--@ main.elm

type Page = 
    Home
   --X

func var = 
    var == Home
          --^
`;
    await testBase.testDefinition(source);
  });
});
