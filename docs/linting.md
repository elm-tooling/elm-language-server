# Linting Configuration

Elm Language Server has built-in support for linting.
All linting rules are enabled by default. If you want to disable a rule you 
can disable them by placing a configuration file in your project.

The linting system was based on Elm-Analyse, and the cofiguration:

`<workspace-root>/elm-analyse.json`

### Example Configuration

This is the default configuration, with all checks enabled:

```json
{
  "checks": {
    "BooleanCase": true,
    "DropConcatOfLists": true,
    "DropConsOfItemAndList": true,
    "NoUncurriedPrefix": true,
    "MapNothingToNothing": true,
    "SingleFieldRecord": true,
    "UnnecessaryListConcat": true,
    "UnnecessaryPortModule": true,
    "UnusedImport": true,
    "UnusedImportAlias": true,
    "UnusedImportedVariable": true,
    "UnusedPatternVariable": true,
    "UnusedTopLevel": true,
    "UnusedTypeAlias": true,
    "UnusedValueConstructor": true,
    "UnusedVariable": true,
    "UseConsOverConcat": true,
    "MissingTypeAnnotation": true
  },
  "excludedPaths": []
}
```

## Exclude paths

You can exclude certain files and folders from being linted by adding their path to
`excludedPaths` in `elm-analyse.json`.

### Example:

```json
"excludedPaths" : [
	"src/Vendor",
	"src/App/FileThatShouldNotBeLinted.elm"
],
```

## Checks

### `BooleanCase`

If you case over a boolean value, it is more idiomatic to use an if-expression.

#### Example rule violation:

```elm
thing : Boolean -> String
thing x =
    case x of
        True ->
            "Hello"
        False ->
            "Goodbye"
```

### `DropConcatOfLists`

If you concatenate two list literals `[...] ++ [...]`, then you can merge them into one list.

#### Example rule violation:

```elm
foo : List Int
foo =
    [ 1, 2, 3 ] ++ [ 4, 5, 6]
```


### `DropConsOfItemAndList`

If you cons an item to a literal list (x :: [1, 2, 3]), then you can just put the item into the list.

#### Example rule violation:

```elm
foo : List Int
foo =
    1 :: [ 2, 3, 4]
```

### `NoUncurriedPrefix`

It's not needed to use an operator in prefix notation when you apply both arguments directly.

#### Example rule violation:

```elm
hello : String
hello =
    (++) "Hello " "World"
```


### `MapNothingToNothing`

Do not map a `Nothing` to `Nothing` with a case expression. Use `andThen` or `map` instead.

#### Example rule violation:

```elm
greet : Maybe String -> Maybe String
greet x =
    case x of
        Nothing ->
            Nothing
        Just x ->
            Just ("Hello " ++ x)
```


### `SingleFieldRecord`

Using a record is obsolete if you only plan to store a single field in it.

#### Example rule violation:

```elm
type Model =
    Model { input : String }
```


### `UnnecessaryListConcat`

You should not use `List.concat` to concatenate literal lists. Just join the lists together.

#### Example rule violation:

```elm
foo : List Int
foo =
    List.concat [ [ 1, 2 ,3 ], [ a, b, c] ]
```

### `UnnecessaryPortModule`

Don't use the port keyword if you do not need it.

#### Example rule violation:

```elm
port module Foo exposing (notAPort)

notAPort : Int
notAPort = 1
```

### `UnusedImport`

Imports that have no meaning should be removed.

#### Example rule violation:

```elm
module Foo exposing (main)

import Html exposing (Html, text)
import SomeOtherModule

main : Html a
main =
    text "Hello"
```

### `UnusedImportAlias`

You defined an alias for an import (import Foo as F), but it turns out you never use it.

#### Example rule violation:

```elm
module Foo exposing (main)

import Html as H exposing (Html, text)

main : Html a
main =
    text "Hello"
```

### `UnusedImportedVariable`

When a function is imported from a module but is unused, it is better to remove it.

#### Example rule violation:

```elm
module Foo exposing (thing)

import Html exposing (Html, div, text)

main : Html a
main =
    text "Hello World!"
```

### `UnusedPatternVariable`

Variables in pattern matching that are unused should be replaced with '_' or left
out completely.

#### Example rule violation:

```elm
greetRecord {name, age} = "Hello " ++ name

greetTuple (name, age) = "Hello " ++ name

greetConstructor (Person name age) = "Hello " ++ name
```

### `UnusedTopLevel`

Functions and values that are unused in a module and not exported are dead code.

#### Example rule violation:

```elm
module Foo exposing (thing)

thing : Int
thing =
    1

unusedThing : String -> String
unusedThing x =
    "Hello " ++ x
```


### `UnusedTypeAlias`

You defined a type alias, but you do not use it in any signature or expose it.

#### Example rule violation:

```elm
module Foo exposing (main)

import Html exposing (Html, text, Html)

type alias SomeUnusedThing =
    { name : String }

main : Html a
main =
    text "Hello World"
```

### `UnusedValueConstructor`

Value constructors which are not exposed and used should be eliminated.

#### Example rule violation:

```elm
module Greet exposing (Color, red, blue)

type Color
    = Blue
    | Red
    | Green

red : Color
red = Red

blue : Color
blue = Blue
```


### `UnusedVariable`

Variables that are not used could be removed or marked as '_'.

#### Example rule violation:

```elm
module Foo exposing (foo)

foo : String -> Int
foo x =
    1
```


### `UseConsOverConcat`

If you concatenate two lists, but the right hand side is a single element list, then you should use the cons operator `::`.

#### Example rule violation:

```elm
foo : List String
foo =
    [ "a" ] ++ [ "b", "c" ]
```


### `MissingTypeAnnotation`

Type annotations are required on top-level declarations.

#### Example rule violation:

```elm
module Foo exposing (foo)

foo = 1
```

_Note: This check was called "NoTopLevelSignature" in Elm-Analyse._


## Compatibility with Elm Analyse

The linter was inspired by the tool [Elm-Analyse](https://stil4m.github.io/elm-analyse/) by [Mats Stijlaart](https://github.com/stil4m), and existing elm-analyse configuration should be fully compatible with ElmLS.

While Elm Language Server does not use Elm-Analyse direct, the check names and descriptions are inspired by it.

We have deliberately excluded some checks that are supported by Elm-Analyse. Either they did not fit well with ElmLS or the issues they check are automatically fixed by elm-format.

ElmLS does also not support the `TriggerWords` property from Elm-Analyses and will just ignore it.