import { DefinitionProviderTestBase } from "./definitionProviderTestBase";

describe("moduleResolveDefinition", () => {
  const testBase = new DefinitionProviderTestBase();

  it(`conflicting module and types`, async () => {
    const source = `
--@ Model.elm
module Model exposing (..)

type alias Model = {
--X
  var: String
}

--@ Main.elm
module Main exposing (..)

import Model exposing (Model)
     
func : Model
        --^Model.elm
`;
    await testBase.testDefinition(source);

    const source2 = `
--@ Model.elm
module Model exposing (..)
--X

type alias Model = {
  var: String
}

--@ Main.elm
module Main exposing (..)

import Model exposing (Model)
      
func = Model.
        --^Model.elm
`;
    await testBase.testDefinition(source2);
  });

  it(`conflicting module alias and types`, async () => {
    const source = `
--@ Module/Model.elm
module Module.Model exposing (..)

type alias Model = {
--X
  var: String
}

--@ Main.elm
module Main exposing (..)

import Module.Model as Model exposing (Model)
     
func : Model
        --^Module/Model.elm
`;
    await testBase.testDefinition(source);

    const source2 = `
--@ Module/Model.elm
module Module.Model exposing (..)
--X

type alias Model = {
  var: String
}

--@ Main.elm
module Main exposing (..)

import Module.Model as Model exposing (Model)
      
func = Model.
        --^Module/Model.elm
`;
    await testBase.testDefinition(source2);
  });

  it(`module and submodule definitions`, async () => {
    const source = `
--@ Module/Model.elm
module Module.Model exposing (..)
--X

type alias Model = {
  var: String
}

--@ Module.elm
module Module exposing (..)

type alias Model = {
  var: String
}

--@ Main.elm
module Main exposing (..)

import Module.Model
     
func = Module.Model.func
             --^Module/Model.elm
`;
    await testBase.testDefinition(source);

    const source2 = `
--@ Module/Model.elm
module Module.Model exposing (..)
--X

type alias Model = {
  var: String
}

--@ Module.elm
module Module exposing (..)

type alias Model = {
  var: String
}

--@ Main.elm
module Main exposing (..)

import Module
import Module.Model
      
func = Module.Model.func
      --^Module/Model.elm
`;
    await testBase.testDefinition(source2);
  });

  it(`module and submodule definitions`, async () => {
    const source = `
--@ Module.elm
module Module exposing (..)
--X

type alias Model = {
  var: String
}

--@ Main.elm
module Main exposing (..)

import Module as Model
     
func = 
  let
    Model.
    --^Module.elm
  
  in
  []
`;
    await testBase.testDefinition(source);
  });
});
