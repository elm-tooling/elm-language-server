module Test2 exposing (Msg, TestType, testFunction)


type alias TestType =
		{ prop1 : String
		, prop2 : Int
		}


type Msg
    = Msg1
    | Msg2


testFunction : String
testFunction =
    "Test"


localFunction : String
localFunction =
    ""
