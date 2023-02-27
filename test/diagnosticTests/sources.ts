export const basicsSources = `
--@ Basics.elm
module Basics exposing
  ( Int, Float
  , (+), (-), (*), (/), (//), (^)
  , toFloat, round, floor, ceiling, truncate
  , (==), (/=)
  , (<), (>), (<=), (>=), max, min, compare, Order(..)
  , Bool(..), not, (&&), (||), xor
  , (++)
  , modBy, remainderBy, negate, abs, clamp, sqrt, logBase, e
  , pi, cos, sin, tan, acos, asin, atan, atan2
  , degrees, radians, turns
  , toPolar, fromPolar
  , isNaN, isInfinite
  , identity, always, (<|), (|>), (<<), (>>), Never, never
  )


import Elm.Kernel.Basics
import Elm.Kernel.Utils



-- INFIX OPERATORS


infix right 0 (<|) = apL
infix left  0 (|>) = apR
infix right 2 (||) = or
infix right 3 (&&) = and
infix non   4 (==) = eq
infix non   4 (/=) = neq
infix non   4 (<)  = lt
infix non   4 (>)  = gt
infix non   4 (<=) = le
infix non   4 (>=) = ge
infix right 5 (++) = append
infix left  6 (+)  = add
infix left  6 (-)  = sub
infix left  7 (*)  = mul
infix left  7 (/)  = fdiv
infix left  7 (//) = idiv
infix right 8 (^)  = pow
infix left  9 (<<) = composeL
infix right 9 (>>) = composeR



-- MATHEMATICS

type Int = Int -- NOTE: The compiler provides the real implementation.


type Float = Float -- NOTE: The compiler provides the real implementation.


add : number -> number -> number
add =
  Elm.Kernel.Basics.add


sub : number -> number -> number
sub =
  Elm.Kernel.Basics.sub


mul : number -> number -> number
mul =
  Elm.Kernel.Basics.mul


fdiv : Float -> Float -> Float
fdiv =
  Elm.Kernel.Basics.fdiv


idiv : Int -> Int -> Int
idiv =
  Elm.Kernel.Basics.idiv


pow : number -> number -> number
pow =
  Elm.Kernel.Basics.pow



-- INT TO FLOAT / FLOAT TO INT


toFloat : Int -> Float
toFloat =
  Elm.Kernel.Basics.toFloat


round : Float -> Int
round =
  Elm.Kernel.Basics.round


floor : Float -> Int
floor =
  Elm.Kernel.Basics.floor


ceiling : Float -> Int
ceiling =
  Elm.Kernel.Basics.ceiling


truncate : Float -> Int
truncate =
  Elm.Kernel.Basics.truncate



-- EQUALITY


eq : a -> a -> Bool
eq =
  Elm.Kernel.Utils.equal


neq : a -> a -> Bool
neq =
  Elm.Kernel.Utils.notEqual



-- COMPARISONS


lt : comparable -> comparable -> Bool
lt =
  Elm.Kernel.Utils.lt


gt : comparable -> comparable -> Bool
gt =
  Elm.Kernel.Utils.gt


le : comparable -> comparable -> Bool
le =
  Elm.Kernel.Utils.le


ge : comparable -> comparable -> Bool
ge =
  Elm.Kernel.Utils.ge


min : comparable -> comparable -> comparable
min x y =
  if lt x y then x else y


max : comparable -> comparable -> comparable
max x y =
  if gt x y then x else y


compare : comparable -> comparable -> Order
compare =
  Elm.Kernel.Utils.compare


type Order = LT | EQ | GT



-- BOOLEANS


type Bool = True | False


not : Bool -> Bool
not =
  Elm.Kernel.Basics.not


and : Bool -> Bool -> Bool
and =
  Elm.Kernel.Basics.and


or : Bool -> Bool -> Bool
or =
  Elm.Kernel.Basics.or


xor : Bool -> Bool -> Bool
xor =
  Elm.Kernel.Basics.xor


-- APPEND


append : appendable -> appendable -> appendable
append =
  Elm.Kernel.Utils.append



-- FANCIER MATH


modBy : Int -> Int -> Int
modBy =
  Elm.Kernel.Basics.modBy


remainderBy : Int -> Int -> Int
remainderBy =
  Elm.Kernel.Basics.remainderBy


negate : number -> number
negate n =
  -n


abs : number -> number
abs n =
  if lt n 0 then -n else n


clamp : number -> number -> number -> number
clamp low high number =
  if lt number low then
    low
  else if gt number high then
    high
  else
    number


sqrt : Float -> Float
sqrt =
  Elm.Kernel.Basics.sqrt


logBase : Float -> Float -> Float
logBase base number =
  fdiv
    (Elm.Kernel.Basics.log number)
    (Elm.Kernel.Basics.log base)


e : Float
e =
  Elm.Kernel.Basics.e


-- ANGLES


radians : Float -> Float
radians angleInRadians =
  angleInRadians


degrees : Float -> Float
degrees angleInDegrees =
  fdiv (mul angleInDegrees pi) 180


turns : Float -> Float
turns angleInTurns =
  mul (mul 2 pi) angleInTurns



-- TRIGONOMETRY


pi : Float
pi =
  Elm.Kernel.Basics.pi


cos : Float -> Float
cos =
  Elm.Kernel.Basics.cos


sin : Float -> Float
sin =
  Elm.Kernel.Basics.sin


tan : Float -> Float
tan =
  Elm.Kernel.Basics.tan


acos : Float -> Float
acos =
  Elm.Kernel.Basics.acos


asin : Float -> Float
asin =
  Elm.Kernel.Basics.asin


atan : Float -> Float
atan =
  Elm.Kernel.Basics.atan


atan2 : Float -> Float -> Float
atan2 =
  Elm.Kernel.Basics.atan2



-- POLAR COORDINATES


fromPolar : (Float,Float) -> (Float,Float)
fromPolar (radius, theta) =
  ( mul radius (cos theta)
  , mul radius (sin theta)
  )


toPolar : (Float,Float) -> (Float,Float)
toPolar ( x, y ) =
  ( sqrt (add (mul x x) (mul y y))
  , atan2 y x
  )



-- CRAZY FLOATS


isNaN : Float -> Bool
isNaN =
  Elm.Kernel.Basics.isNaN


isInfinite : Float -> Bool
isInfinite =
  Elm.Kernel.Basics.isInfinite



-- FUNCTION HELPERS


composeL : (b -> c) -> (a -> b) -> (a -> c)
composeL g f x =
  g (f x)


composeR : (a -> b) -> (b -> c) -> (a -> c)
composeR f g x =
  g (f x)


apR : a -> (a -> b) -> b
apR x f =
  f x


apL : (a -> b) -> a -> b
apL f x =
  f x


identity : a -> a
identity x =
  x


always : a -> b -> a
always a _ =
  a


type Never = JustOneMore Never


never : Never -> a
never (JustOneMore nvr) =
  never nvr


--@ Char.elm
module Char exposing (Char)

import Basics exposing (Bool, Int, (&&), (||), (>=), (<=))
import Elm.Kernel.Char

type Char = Char


--@ Maybe.elm
module Maybe exposing (Maybe(..))

type Maybe a
    = Just a
    | Nothing


--@ Dict.elm
module Dict exposing (Dict, member)


type NColor
    = Red
    | Black


type Dict k v
    = RBNode_elm_builtin NColor k v (Dict k v) (Dict k v)
    | RBEmpty_elm_builtin


member : comparable -> Dict comparable v -> Bool
member key dict =
  case get key dict of
    Just _ ->
      True

    Nothing ->
      False


--@ Set.elm
module Set exposing (Set)


import Dict


type Set t =
  Set_elm_builtin (Dict.Dict t ())


member : comparable -> Set comparable -> Bool
member key (Set_elm_builtin dict) =
  Dict.member key dict
`;

export const stringSources = `
--@ String.elm
module String exposing (String, fromInt, fromFloat, slice, length, toFloat, uncons)


import Elm.Kernel.List
import Elm.Kernel.String


type String = String


fromInt : Int -> String
fromInt =
  \\_ -> ""


fromFloat : Float -> String
fromFloat =
  \\_ -> ""


slice : Int -> Int -> String -> String
slice =
  Elm.Kernel.String.slice


length : String -> Int
length =
  Elm.Kernel.String.length


toFloat : String -> Maybe Float
toFloat =
  Elm.Kernel.String.toFloat
  

uncons : String -> Maybe (Char, String)
uncons =
  Elm.Kernel.String.uncons
`;

export const parserSources = `
--@ Parser.elm
module Parser exposing
  ( Parser, run
  , int, float, number, symbol, keyword, variable, end
  , succeed, (|=), (|.), lazy, andThen, problem
  , oneOf, map, backtrackable, commit, token
  , sequence, Trailing(..), loop, Step(..)
  , spaces, lineComment, multiComment, Nestable(..)
  , getChompedString, chompIf, chompWhile, chompUntil, chompUntilEndOr, mapChompedString
  , DeadEnd, Problem(..), deadEndsToString
  , withIndent, getIndent
  , getPosition, getRow, getCol, getOffset, getSource
  )


import Char
import Parser.Advanced as A exposing ((|=), (|.))
import Set



-- INFIX OPERATORS - see Parser.Advanced for why 5 and 6 were chosen


infix left 5 (|=) = keeper
infix left 6 (|.) = ignorer



-- PARSERS

type alias Parser a =
  A.Parser Never Problem a



-- RUN


run : Parser a -> String -> Result (List DeadEnd) a
run parser source =
  case A.run parser source of
    Ok a ->
      Ok a

    Err problems ->
      Err (List.map problemToDeadEnd problems)


problemToDeadEnd : A.DeadEnd Never Problem -> DeadEnd
problemToDeadEnd p =
  DeadEnd p.row p.col p.problem



-- PROBLEMS


type alias DeadEnd =
  { row : Int
  , col : Int
  , problem : Problem
  }


type Problem
  = Expecting String
  | ExpectingInt
  | ExpectingHex
  | ExpectingOctal
  | ExpectingBinary
  | ExpectingFloat
  | ExpectingNumber
  | ExpectingVariable
  | ExpectingSymbol String
  | ExpectingKeyword String
  | ExpectingEnd
  | UnexpectedChar
  | Problem String
  | BadRepeat


deadEndsToString : List DeadEnd -> String
deadEndsToString deadEnds =
  "TODO deadEndsToString"



-- PIPELINES


succeed : a -> Parser a
succeed =
  A.succeed


keeper : Parser (a -> b) -> Parser a -> Parser b
keeper =
  (|=)


ignorer : Parser keep -> Parser ignore -> Parser keep
ignorer =
  (|.)


lazy : (() -> Parser a) -> Parser a
lazy =
  A.lazy


andThen : (a -> Parser b) -> Parser a -> Parser b
andThen =
  A.andThen


problem : String -> Parser a
problem msg =
  A.problem (Problem msg)



-- BACKTRACKING

oneOf : List (Parser a) -> Parser a
oneOf =
  A.oneOf


map : (a -> b) -> Parser a -> Parser b
map =
  A.map


backtrackable : Parser a -> Parser a
backtrackable =
  A.backtrackable


commit : a -> Parser a
commit =
  A.commit



-- TOKEN


token : String -> Parser ()
token str =
  A.token (toToken str)


toToken : String -> A.Token Problem
toToken str =
  A.Token str (Expecting str)



-- LOOPS


loop : state -> (state -> Parser (Step state a)) -> Parser a
loop state callback =
  A.loop state (\\s -> map toAdvancedStep (callback s))


type Step state a
  = Loop state
  | Done a


toAdvancedStep : Step s a -> A.Step s a
toAdvancedStep step =
  case step of
    Loop s -> A.Loop s
    Done a -> A.Done a



-- NUMBERS


int : Parser Int
int =
  A.int ExpectingInt ExpectingInt


float : Parser Float
float =
  A.float ExpectingFloat ExpectingFloat



-- NUMBER


number
  : { int : Maybe (Int -> a)
    , hex : Maybe (Int -> a)
    , octal : Maybe (Int -> a)
    , binary : Maybe (Int -> a)
    , float : Maybe (Float -> a)
    }
  -> Parser a
number i =
  A.number
    { int = Result.fromMaybe ExpectingInt i.int
    , hex = Result.fromMaybe ExpectingHex i.hex
    , octal = Result.fromMaybe ExpectingOctal i.octal
    , binary = Result.fromMaybe ExpectingBinary i.binary
    , float = Result.fromMaybe ExpectingFloat i.float
    , invalid = ExpectingNumber
    , expecting = ExpectingNumber
    }



-- SYMBOL


symbol : String -> Parser ()
symbol str =
  A.symbol (A.Token str (ExpectingSymbol str))



-- KEYWORD


keyword : String -> Parser ()
keyword kwd =
  A.keyword (A.Token kwd (ExpectingKeyword kwd))



-- END


end : Parser ()
end =
  A.end ExpectingEnd



-- CHOMPED STRINGS


getChompedString : Parser a -> Parser String
getChompedString =
  A.getChompedString


mapChompedString : (String -> a -> b) -> Parser a -> Parser b
mapChompedString =
  A.mapChompedString



chompIf : (Char -> Bool) -> Parser ()
chompIf isGood =
  A.chompIf isGood UnexpectedChar



chompWhile : (Char -> Bool) -> Parser ()
chompWhile =
  A.chompWhile


chompUntil : String -> Parser ()
chompUntil str =
  A.chompUntil (toToken str)


chompUntilEndOr : String -> Parser ()
chompUntilEndOr =
  A.chompUntilEndOr



-- INDENTATION


withIndent : Int -> Parser a -> Parser a
withIndent =
  A.withIndent


getIndent : Parser Int
getIndent =
  A.getIndent



-- POSITION


getPosition : Parser (Int, Int)
getPosition =
  A.getPosition


getRow : Parser Int
getRow =
  A.getRow


getCol : Parser Int
getCol =
  A.getCol


getOffset : Parser Int
getOffset =
  A.getOffset


getSource : Parser String
getSource =
  A.getSource



-- VARIABLES


variable :
  { start : Char -> Bool
  , inner : Char -> Bool
  , reserved : Set.Set String
  }
  -> Parser String
variable i =
  A.variable
    { start = i.start
    , inner = i.inner
    , reserved = i.reserved
    , expecting = ExpectingVariable
    }



-- SEQUENCES


sequence
  : { start : String
    , separator : String
    , end : String
    , spaces : Parser ()
    , item : Parser a
    , trailing : Trailing
    }
  -> Parser (List a)
sequence i =
  A.sequence
    { start = toToken i.start
    , separator = toToken i.separator
    , end = toToken i.end
    , spaces = i.spaces
    , item = i.item
    , trailing = toAdvancedTrailing i.trailing
    }


type Trailing = Forbidden | Optional | Mandatory


toAdvancedTrailing : Trailing -> A.Trailing
toAdvancedTrailing trailing =
  case trailing of
    Forbidden -> A.Forbidden
    Optional -> A.Optional
    Mandatory -> A.Mandatory



-- WHITESPACE


spaces : Parser ()
spaces =
  A.spaces


lineComment : String -> Parser ()
lineComment str =
  A.lineComment (toToken str)


multiComment : String -> String -> Nestable -> Parser ()
multiComment open close nestable =
  A.multiComment (toToken open) (toToken close) (toAdvancedNestable nestable)


type Nestable = NotNestable | Nestable


toAdvancedNestable : Nestable -> A.Nestable
toAdvancedNestable nestable =
  case nestable of
    NotNestable -> A.NotNestable
    Nestable -> A.Nestable


--@ Parser/Advanced.elm
module Parser.Advanced exposing
  ( Parser, run, DeadEnd, inContext, Token(..)
  , int, float, number, symbol, keyword, variable, end
  , succeed, (|=), (|.), lazy, andThen, problem
  , oneOf, map, backtrackable, commit, token
  , sequence, Trailing(..), loop, Step(..)
  , spaces, lineComment, multiComment, Nestable(..)
  , getChompedString, chompIf, chompWhile, chompUntil, chompUntilEndOr, mapChompedString
  , withIndent, getIndent
  , getPosition, getRow, getCol, getOffset, getSource
  )


import Char
import Elm.Kernel.Parser
import Set



-- INFIX OPERATORS


infix left 5 (|=) = keeper
infix left 6 (|.) = ignorer





-- PARSERS


type Parser context problem value =
  Parser (State context -> PStep context problem value)


type PStep context problem value
  = Good Bool value (State context)
  | Bad Bool (Bag context problem)


type alias State context =
  { src : String
  , offset : Int
  , indent : Int
  , context : List (Located context)
  , row : Int
  , col : Int
  }


type alias Located context =
  { row : Int
  , col : Int
  , context : context
  }



-- RUN


run : Parser c x a -> String -> Result (List (DeadEnd c x)) a
run (Parser parse) src =
  case parse { src = src, offset = 0, indent = 1, context = [], row = 1, col = 1} of
    Good _ value _ ->
      Ok value

    Bad _ bag ->
      Err (bagToList bag [])



-- PROBLEMS


type alias DeadEnd context problem =
  { row : Int
  , col : Int
  , problem : problem
  , contextStack : List { row : Int, col : Int, context : context }
  }


type Bag c x
  = Empty
  | AddRight (Bag c x) (DeadEnd c x)
  | Append (Bag c x) (Bag c x)


fromState : State c -> x -> Bag c x
fromState s x =
  AddRight Empty (DeadEnd s.row s.col x s.context)


fromInfo : Int -> Int -> x -> List (Located c) -> Bag c x
fromInfo row col x context =
  AddRight Empty (DeadEnd row col x context)


bagToList : Bag c x -> List (DeadEnd c x) -> List (DeadEnd c x)
bagToList bag list =
  case bag of
    Empty ->
      list

    AddRight bag1 x ->
      bagToList bag1 (x :: list)

    Append bag1 bag2 ->
      bagToList bag1 (bagToList bag2 list)



-- PRIMITIVES

succeed : a -> Parser c x a
succeed a =
  Parser <| \\s ->
    Good False a s


problem : x -> Parser c x a
problem x =
  Parser <| \\s ->
    Bad False (fromState s x)



-- MAPPING


map : (a -> b) -> Parser c x a -> Parser c x b
map func (Parser parse) =
  Parser <| \\s0 ->
    case parse s0 of
      Good p a s1 ->
        Good p (func a) s1

      Bad p x ->
        Bad p x


map2 : (a -> b -> value) -> Parser c x a -> Parser c x b -> Parser c x value
map2 func (Parser parseA) (Parser parseB) =
  Parser <| \\s0 ->
    case parseA s0 of
      Bad p x ->
        Bad p x

      Good p1 a s1 ->
        case parseB s1 of
          Bad p2 x ->
            Bad (p1 || p2) x

          Good p2 b s2 ->
            Good (p1 || p2) (func a b) s2


keeper : Parser c x (a -> b) -> Parser c x a -> Parser c x b
keeper parseFunc parseArg =
  map2 (<|) parseFunc parseArg


ignorer : Parser c x keep -> Parser c x ignore -> Parser c x keep
ignorer keepParser ignoreParser =
  map2 always keepParser ignoreParser



-- AND THEN


andThen : (a -> Parser c x b) -> Parser c x a -> Parser c x b
andThen callback (Parser parseA) =
  Parser <| \\s0 ->
    case parseA s0 of
      Bad p x ->
        Bad p x

      Good p1 a s1 ->
        let
          (Parser parseB) =
            callback a
        in
        case parseB s1 of
          Bad p2 x ->
            Bad (p1 || p2) x

          Good p2 b s2 ->
            Good (p1 || p2) b s2



-- LAZY


lazy : (() -> Parser c x a) -> Parser c x a
lazy thunk =
  Parser <| \\s ->
    let
      (Parser parse) =
        thunk ()
    in
    parse s



-- ONE OF


oneOf : List (Parser c x a) -> Parser c x a
oneOf parsers =
  Parser <| \\s -> oneOfHelp s Empty parsers


oneOfHelp : State c -> Bag c x -> List (Parser c x a) -> PStep c x a
oneOfHelp s0 bag parsers =
  case parsers of
    [] ->
      Bad False bag

    Parser parse :: remainingParsers ->
      case parse s0 of
        Good _ _ _ as step ->
          step

        Bad p x as step ->
          if p then
            step
          else
            oneOfHelp s0 (Append bag x) remainingParsers



-- LOOP


type Step state a
  = Loop state
  | Done a


loop : state -> (state -> Parser c x (Step state a)) -> Parser c x a
loop state callback =
  Parser <| \\s ->
    loopHelp False state callback s


loopHelp : Bool -> state -> (state -> Parser c x (Step state a)) -> State c -> PStep c x a
loopHelp p state callback s0 =
  let
    (Parser parse) =
      callback state
  in
  case parse s0 of
    Good p1 step s1 ->
      case step of
        Loop newState ->
          loopHelp (p || p1) newState callback s1

        Done result ->
          Good (p || p1) result s1

    Bad p1 x ->
      Bad (p || p1) x



-- BACKTRACKABLE


backtrackable : Parser c x a -> Parser c x a
backtrackable (Parser parse) =
  Parser <| \\s0 ->
    case parse s0 of
      Bad _ x ->
        Bad False x

      Good _ a s1 ->
        Good False a s1


commit : a -> Parser c x a
commit a =
  Parser <| \\s -> Good True a s



-- SYMBOL


symbol : Token x -> Parser c x ()
symbol =
  token



-- KEYWORD


keyword : Token x -> Parser c x ()
keyword (Token kwd expecting) =
  let
    progress =
      not (String.isEmpty kwd)
  in
  Parser <| \\s ->
    let
      (newOffset, newRow, newCol) =
        isSubString kwd s.offset s.row s.col s.src
    in
    if newOffset == -1 || 0 <= isSubChar (\\c -> Char.isAlphaNum c || c == '_') newOffset s.src then
      Bad False (fromState s expecting)
    else
      Good progress ()
        { src = s.src
        , offset = newOffset
        , indent = s.indent
        , context = s.context
        , row = newRow
        , col = newCol
        }



-- TOKEN


type Token x = Token String x


token : Token x -> Parser c x ()
token (Token str expecting) =
  let
    progress =
      not (String.isEmpty str)
  in
  Parser <| \\s ->
    let
      (newOffset, newRow, newCol) =
        isSubString str s.offset s.row s.col s.src
    in
    if newOffset == -1 then
      Bad False (fromState s expecting)
    else
      Good progress ()
        { src = s.src
        , offset = newOffset
        , indent = s.indent
        , context = s.context
        , row = newRow
        , col = newCol
        }



-- INT


int : x -> x -> Parser c x Int
int expecting invalid =
  number
    { int = Ok identity
    , hex = Err invalid
    , octal = Err invalid
    , binary = Err invalid
    , float = Err invalid
    , invalid = invalid
    , expecting = expecting
    }



-- FLOAT


float : x -> x -> Parser c x Float
float expecting invalid =
  number
    { int = Ok toFloat
    , hex = Err invalid
    , octal = Err invalid
    , binary = Err invalid
    , float = Ok identity
    , invalid = invalid
    , expecting = expecting
    }



-- NUMBER


number
  : { int : Result x (Int -> a)
    , hex : Result x (Int -> a)
    , octal : Result x (Int -> a)
    , binary : Result x (Int -> a)
    , float : Result x (Float -> a)
    , invalid : x
    , expecting : x
    }
  -> Parser c x a
number c =
  Parser <| \\s ->
    if isAsciiCode 0x30 {- 0 -} s.offset s.src then
      let
        zeroOffset = s.offset + 1
        baseOffset = zeroOffset + 1
      in
      if isAsciiCode 0x78 {- x -} zeroOffset s.src then
        finalizeInt c.invalid c.hex baseOffset (consumeBase16 baseOffset s.src) s
      else if isAsciiCode 0x6F {- o -} zeroOffset s.src then
        finalizeInt c.invalid c.octal baseOffset (consumeBase 8 baseOffset s.src) s
      else if isAsciiCode 0x62 {- b -} zeroOffset s.src then
        finalizeInt c.invalid c.binary baseOffset (consumeBase 2 baseOffset s.src) s
      else
        finalizeFloat c.invalid c.expecting c.int c.float (zeroOffset, 0) s

    else
      finalizeFloat c.invalid c.expecting c.int c.float (consumeBase 10 s.offset s.src) s


consumeBase : Int -> Int -> String -> (Int, Int)
consumeBase =
  Elm.Kernel.Parser.consumeBase


consumeBase16 : Int -> String -> (Int, Int)
consumeBase16 =
  Elm.Kernel.Parser.consumeBase16


finalizeInt : x -> Result x (Int -> a) -> Int -> (Int, Int) -> State c -> PStep c x a
finalizeInt invalid handler startOffset (endOffset, n) s =
  case handler of
    Err x ->
      Bad True (fromState s x)

    Ok toValue ->
      if startOffset == endOffset
        then Bad (s.offset < startOffset) (fromState s invalid)
        else Good True (toValue n) (bumpOffset endOffset s)


bumpOffset : Int -> State c -> State c
bumpOffset newOffset s =
  { src = s.src
  , offset = newOffset
  , indent = s.indent
  , context = s.context
  , row = s.row
  , col = s.col + (newOffset - s.offset)
  }


finalizeFloat : x -> x -> Result x (Int -> a) -> Result x (Float -> a) -> (Int, Int) -> State c -> PStep c x a
finalizeFloat invalid expecting intSettings floatSettings intPair s =
  let
    intOffset = Tuple.first intPair
    floatOffset = consumeDotAndExp intOffset s.src
  in
  if floatOffset < 0 then
    Bad True (fromInfo s.row (s.col - (floatOffset + s.offset)) invalid s.context)

  else if s.offset == floatOffset then
    Bad False (fromState s expecting)

  else if intOffset == floatOffset then
    finalizeInt invalid intSettings s.offset intPair s

  else
    case floatSettings of
      Err x ->
        Bad True (fromState s invalid)

      Ok toValue ->
        case String.toFloat (String.slice s.offset floatOffset s.src) of
          Nothing -> Bad True (fromState s invalid)
          Just n -> Good True (toValue n) (bumpOffset floatOffset s)


--
-- On a failure, returns negative index of problem.
--
consumeDotAndExp : Int -> String -> Int
consumeDotAndExp offset src =
  if isAsciiCode 0x2E {- . -} offset src then
    consumeExp (chompBase10 (offset + 1) src) src
  else
    consumeExp offset src


--
-- On a failure, returns negative index of problem.
--
consumeExp : Int -> String -> Int
consumeExp offset src =
  if isAsciiCode 0x65 {- e -} offset src || isAsciiCode 0x45 {- E -} offset src then
    let
      eOffset = offset + 1

      expOffset =
        if isAsciiCode 0x2B {- + -} eOffset src || isAsciiCode 0x2D {- - -} eOffset src then
          eOffset + 1
        else
          eOffset

      newOffset = chompBase10 expOffset src
    in
    if expOffset == newOffset then
      -newOffset
    else
      newOffset

  else
    offset


chompBase10 : Int -> String -> Int
chompBase10 =
  Elm.Kernel.Parser.chompBase10



-- END


end : x -> Parser c x ()
end x =
  Parser <| \\s ->
    if String.length s.src == s.offset then
      Good False () s
    else
      Bad False (fromState s x)



-- CHOMPED STRINGS


getChompedString : Parser c x a -> Parser c x String
getChompedString parser =
  mapChompedString always parser


mapChompedString : (String -> a -> b) -> Parser c x a -> Parser c x b
mapChompedString func (Parser parse) =
  Parser <| \\s0 ->
    case parse s0 of
      Bad p x ->
        Bad p x

      Good p a s1 ->
        Good p (func (String.slice s0.offset s1.offset s0.src) a) s1



-- CHOMP IF


chompIf : (Char -> Bool) -> x -> Parser c x ()
chompIf isGood expecting =
  Parser <| \\s ->
    let
      newOffset = isSubChar isGood s.offset s.src
    in
    -- not found
    if newOffset == -1 then
      Bad False (fromState s expecting)

    -- newline
    else if newOffset == -2 then
      Good True ()
        { src = s.src
        , offset = s.offset + 1
        , indent = s.indent
        , context = s.context
        , row = s.row + 1
        , col = 1
        }

    -- found
    else
      Good True ()
        { src = s.src
        , offset = newOffset
        , indent = s.indent
        , context = s.context
        , row = s.row
        , col = s.col + 1
        }



-- CHOMP WHILE


chompWhile : (Char -> Bool) -> Parser c x ()
chompWhile isGood =
  Parser <| \\s ->
    chompWhileHelp isGood s.offset s.row s.col s


chompWhileHelp : (Char -> Bool) -> Int -> Int -> Int -> State c -> PStep c x ()
chompWhileHelp isGood offset row col s0 =
  let
    newOffset = isSubChar isGood offset s0.src
  in
  -- no match
  if newOffset == -1 then
    Good (s0.offset < offset) ()
      { src = s0.src
      , offset = offset
      , indent = s0.indent
      , context = s0.context
      , row = row
      , col = col
      }

  -- matched a newline
  else if newOffset == -2 then
    chompWhileHelp isGood (offset + 1) (row + 1) 1 s0

  -- normal match
  else
    chompWhileHelp isGood newOffset row (col + 1) s0



-- CHOMP UNTIL


chompUntil : Token x -> Parser c x ()
chompUntil (Token str expecting) =
  Parser <| \\s ->
    let
      (newOffset, newRow, newCol) =
        findSubString str s.offset s.row s.col s.src
    in
    if newOffset == -1 then
      Bad False (fromInfo newRow newCol expecting s.context)

    else
      Good (s.offset < newOffset) ()
        { src = s.src
        , offset = newOffset
        , indent = s.indent
        , context = s.context
        , row = newRow
        , col = newCol
        }


chompUntilEndOr : String -> Parser c x ()
chompUntilEndOr str =
  Parser <| \\s ->
    let
      (newOffset, newRow, newCol) =
        Elm.Kernel.Parser.findSubString str s.offset s.row s.col s.src

      adjustedOffset =
        if newOffset < 0 then String.length s.src else newOffset
    in
    Good (s.offset < adjustedOffset) ()
      { src = s.src
      , offset = adjustedOffset
      , indent = s.indent
      , context = s.context
      , row = newRow
      , col = newCol
      }



-- CONTEXT


inContext : context -> Parser context x a -> Parser context x a
inContext context (Parser parse) =
  Parser <| \\s0 ->
    case parse (changeContext (Located s0.row s0.col context :: s0.context) s0) of
      Good p a s1 ->
        Good p a (changeContext s0.context s1)

      Bad _ _ as step ->
        step


changeContext : List (Located c) -> State c -> State c
changeContext newContext s =
  { src = s.src
  , offset = s.offset
  , indent = s.indent
  , context = newContext
  , row = s.row
  , col = s.col
  }



-- INDENTATION


getIndent : Parser c x Int
getIndent =
  Parser <| \\s -> Good False s.indent s


withIndent : Int -> Parser c x a -> Parser c x a
withIndent newIndent (Parser parse) =
  Parser <| \\s0 ->
    case parse (changeIndent newIndent s0) of
      Good p a s1 ->
        Good p a (changeIndent s0.indent s1)

      Bad p x ->
        Bad p x


changeIndent : Int -> State c -> State c
changeIndent newIndent s =
  { src = s.src
  , offset = s.offset
  , indent = newIndent
  , context = s.context
  , row = s.row
  , col = s.col
  }



-- POSITION


getPosition : Parser c x (Int, Int)
getPosition =
  Parser <| \\s -> Good False (s.row, s.col) s


getRow : Parser c x Int
getRow =
  Parser <| \\s -> Good False s.row s


getCol : Parser c x Int
getCol =
  Parser <| \\s -> Good False s.col s


getOffset : Parser c x Int
getOffset =
  Parser <| \\s -> Good False s.offset s


getSource : Parser c x String
getSource =
  Parser <| \\s -> Good False s.src s



-- LOW-LEVEL HELPERS


isSubString : String -> Int -> Int -> Int -> String -> (Int, Int, Int)
isSubString =
  Elm.Kernel.Parser.isSubString


isSubChar : (Char -> Bool) -> Int -> String -> Int
isSubChar =
  Elm.Kernel.Parser.isSubChar


isAsciiCode : Int -> Int -> String -> Bool
isAsciiCode =
  Elm.Kernel.Parser.isAsciiCode


findSubString : String -> Int -> Int -> Int -> String -> (Int, Int, Int)
findSubString =
  Elm.Kernel.Parser.findSubString



-- VARIABLES


variable :
  { start : Char -> Bool
  , inner : Char -> Bool
  , reserved : Set.Set String
  , expecting : x
  }
  -> Parser c x String
variable i =
  Parser <| \\s ->
    let
      firstOffset =
        isSubChar i.start s.offset s.src
    in
    if firstOffset == -1 then
      Bad False (fromState s i.expecting)
    else
      let
        s1 =
          if firstOffset == -2 then
            varHelp i.inner (s.offset + 1) (s.row + 1) 1 s.src s.indent s.context
          else
            varHelp i.inner firstOffset s.row (s.col + 1) s.src s.indent s.context

        name =
          String.slice s.offset s1.offset s.src
      in
      if Set.member name i.reserved then
        Bad False (fromState s i.expecting)
      else
        Good True name s1


varHelp : (Char -> Bool) -> Int -> Int -> Int -> String -> Int -> List (Located c) -> State c
varHelp isGood offset row col src indent context =
  let
    newOffset = isSubChar isGood offset src
  in
  if newOffset == -1 then
    { src = src
    , offset = offset
    , indent = indent
    , context = context
    , row = row
    , col = col
    }

  else if newOffset == -2 then
    varHelp isGood (offset + 1) (row + 1) 1 src indent context

  else
    varHelp isGood newOffset row (col + 1) src indent context



-- SEQUENCES


sequence
  : { start : Token x
    , separator : Token x
    , end : Token x
    , spaces : Parser c x ()
    , item : Parser c x a
    , trailing : Trailing
    }
  -> Parser c x (List a)
sequence i =
  skip (token i.start) <|
  skip i.spaces <|
    sequenceEnd (token i.end) i.spaces i.item (token i.separator) i.trailing


type Trailing = Forbidden | Optional | Mandatory


skip : Parser c x ignore -> Parser c x keep -> Parser c x keep
skip iParser kParser =
  map2 revAlways iParser kParser


revAlways : a -> b -> b
revAlways _ b =
  b


sequenceEnd : Parser c x () -> Parser c x () -> Parser c x a -> Parser c x () -> Trailing -> Parser c x (List a)
sequenceEnd ender ws parseItem sep trailing =
  let
    chompRest item =
      case trailing of
        Forbidden ->
          loop [item] (sequenceEndForbidden ender ws parseItem sep)

        Optional ->
          loop [item] (sequenceEndOptional ender ws parseItem sep)

        Mandatory ->
          ignorer
            ( skip ws <| skip sep <| skip ws <|
                loop [item] (sequenceEndMandatory ws parseItem sep)
            )
            ender
  in
  oneOf
    [ parseItem |> andThen chompRest
    , ender |> map (\\_ -> [])
    ]


sequenceEndForbidden : Parser c x () -> Parser c x () -> Parser c x a -> Parser c x () -> List a -> Parser c x (Step (List a) (List a))
sequenceEndForbidden ender ws parseItem sep revItems =
  let
    chompRest item =
      sequenceEndForbidden ender ws parseItem sep (item :: revItems)
  in
  skip ws <|
    oneOf
      [ skip sep <| skip ws <| map (\\item -> Loop (item :: revItems)) parseItem
      , ender |> map (\\_ -> Done (List.reverse revItems))
      ]


sequenceEndOptional : Parser c x () -> Parser c x () -> Parser c x a -> Parser c x () -> List a -> Parser c x (Step (List a) (List a))
sequenceEndOptional ender ws parseItem sep revItems =
  let
    parseEnd =
      map (\\_ -> Done (List.reverse revItems)) ender
  in
  skip ws <|
    oneOf
      [ skip sep <| skip ws <|
          oneOf
            [ parseItem |> map (\\item -> Loop (item :: revItems))
            , parseEnd
            ]
      , parseEnd
      ]


sequenceEndMandatory : Parser c x () -> Parser c x a -> Parser c x () -> List a -> Parser c x (Step (List a) (List a))
sequenceEndMandatory ws parseItem sep revItems =
  oneOf
    [ map (\\item -> Loop (item :: revItems)) <|
        ignorer parseItem (ignorer ws (ignorer sep ws))
    , map (\\_ -> Done (List.reverse revItems)) (succeed ())
    ]



-- WHITESPACE


spaces : Parser c x ()
spaces =
  chompWhile (\\c -> c == ' ' || c == '\\n' || c == '\\r')


lineComment : Token x -> Parser c x ()
lineComment start =
  ignorer (token start) (chompUntilEndOr "\\n")


multiComment : Token x -> Token x -> Nestable -> Parser c x ()
multiComment open close nestable =
  case nestable of
    NotNestable ->
      ignorer (token open) (chompUntil close)

    Nestable ->
      nestableComment open close


type Nestable = NotNestable | Nestable


nestableComment : Token x -> Token x -> Parser c x ()
nestableComment (Token oStr oX as open) (Token cStr cX as close) =
  case String.uncons oStr of
    Nothing ->
      problem oX

    Just (openChar, _) ->
      case String.uncons cStr of
        Nothing ->
          problem cX

        Just (closeChar, _) ->
          let
            isNotRelevant char =
              char /= openChar && char /= closeChar

            chompOpen =
              token open
          in
          ignorer chompOpen (nestableHelp isNotRelevant chompOpen (token close) cX 1)


nestableHelp : (Char -> Bool) -> Parser c x () -> Parser c x () -> x -> Int -> Parser c x ()
nestableHelp isNotRelevant open close expectingClose nestLevel =
  skip (chompWhile isNotRelevant) <|
    oneOf
      [ if nestLevel == 1 then
          close
        else
          close
            |> andThen (\\_ -> nestableHelp isNotRelevant open close expectingClose (nestLevel - 1))
      , open
          |> andThen (\\_ -> nestableHelp isNotRelevant open close expectingClose (nestLevel + 1))
      , chompIf isChar expectingClose
          |> andThen (\\_ -> nestableHelp isNotRelevant open close expectingClose nestLevel)
      ]


isChar : Char -> Bool
isChar char =
  True
`;

export const listSources = `
--@ List.elm
module List exposing ((::), reverse, foldl)

import Basics exposing (..)
import Elm.Kernel.List

infix right 5 (::) = cons

cons : a -> List a -> List a
cons =
  Elm.Kernel.List.cons


reverse : List a -> List a
reverse list =
  foldl cons [] list


foldl : (a -> b -> b) -> b -> List a -> b
foldl func acc list =
  case list of
    [] ->
      acc

    x :: xs ->
      foldl func (func x acc) xs
`;
