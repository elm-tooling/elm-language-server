import { DefinitionProviderTestBase } from "./definitionProviderTestBase";

describe("recordFieldDefinition", () => {
  const testBase = new DefinitionProviderTestBase();

  it(`test simple field access`, async () => {
    const source = `
type alias R = { field : () }
                 --X
main : R -> ()
main r = r.field
           --^
`;
    await testBase.testDefinition(source);
  });

  it(`test chained field access at end of chain`, async () => {
    const source = `
type alias S = { nested : () }
                 --X
type alias R = { field : S }
main : R -> ()
main r = r.field.nested
                  --^
`;
    await testBase.testDefinition(source);
  });

  it(`test chained field access at middle of chain`, async () => {
    const source = `
type alias S = { nested : () }
type alias R = { field : S }
                 --X
main : R -> ()
main r = r.field.nested
           --^
`;
    await testBase.testDefinition(source);
  });

  it(`test simple field accessor function`, async () => {
    const source = `
type alias R = { field : () }
                 --X
main : R -> ()
main r =
    .field r
      --^
`;
    await testBase.testDefinition(source);
  });

  it(`test field access on return value inside unannotated function`, async () => {
    const source = `
type alias R = { field : () }
                 --X
r : () -> R
r unit = { field = unit }
main = (r ()).field
               --^
`;
    await testBase.testDefinition(source);
  });

  it(`test field access to parameterized record`, async () => {
    const source = `
type alias R a = { field : a }
                 --X
main : R () -> ()
main r = r.field
           --^
`;
    await testBase.testDefinition(source);
  });

  it(`test field access to field in record parameter`, async () => {
    const source = `
type alias R a = { a | field : () }
type alias S = { s : R { field2 : () } }
                          --X
main : S -> ()
main r = r.s.field2
               --^
`;
    await testBase.testDefinition(source);
  });

  it(`test field access to nested parameterized record`, async () => {
    const source = `
type alias S = { nested : () }
                 --X
type alias R a = { field : a }
main : R S -> ()
main r = r.field.nested
                  --^
`;
    await testBase.testDefinition(source);
  });

  it(`test field access in lambda call`, async () => {
    const source = `
type alias R = { field : () }
                 --X
main : R -> ()
main r = (\\rr -> rr.field) r
                     --^
`;
    await testBase.testDefinition(source);
  });

  it(`test record update`, async () => {
    const source = `
type alias R = { field : () }
                 --X
main : R -> R
main r = { r | field = ()}
                --^
`;
    await testBase.testDefinition(source);
  });

  it(`test record update access`, async () => {
    const source = `
type alias R = { field : () }
                 --X
main : R -> ()
main r = { r | field = () }.field
                           --^
`;
    await testBase.testDefinition(source);
  });

  it(`test field access of variant param`, async () => {
    const source = `
type T = T { field : () }
              --X
main : T -> ()
main t =
     case t of
         T record ->
             record.field
                     --^
`;
    await testBase.testDefinition(source);
  });

  it(`test record value in function call`, async () => {
    const source = `
type alias R = { field : () }
                 --X
func : R -> ()
func _ = ()
main : ()
main = func { field = () }
               --^
`;
    await testBase.testDefinition(source);
  });

  it(`test record value in forward pipeline`, async () => {
    const source = `
infix left  0 (|>) = apR
apR : a -> (a -> b) -> b
apR x f = f x
type alias R = { field : () }
                 --X
func : R -> ()
func _ = ()
main : ()
main = { field = () } |> func
          --^
`;
    await testBase.testDefinition(source);
  });

  it(`test record value in backward pipeline`, async () => {
    const source = `
infix right 0 (<|) = apL
apL : (a -> b) -> a -> b
apL f x =
  f x
type alias R = { field : () }
                 --X
func : R -> ()
func _ = ()
main : ()
main = func <| { field = () }
                 --^
`;
    await testBase.testDefinition(source);
  });

  it(`test record value returned from function`, async () => {
    const source = `
type alias R = { field : () }
                 --X
main : R
main = { field = () }
          --^
`;
    await testBase.testDefinition(source);
  });

  it(`test record value returned from lambda`, async () => {
    const source = `
type alias R = { field : () }
                 --X
main : R
main = (\\_ -> { field = () }) 1
                 --^
`;
    await testBase.testDefinition(source);
  });

  it(`test nested decl field access`, async () => {
    const source = `
type alias R = { field : () }
                 --X
main : R -> ()
main r = 
  let
    nest = r.field
             --^
  in
  nest
`;
    await testBase.testDefinition(source);
  });

  // Problem with the tree parsing an error. I'm guessing its the comment in the let expr
  xit(`test nested decl mapper`, async () => {
    const source = `                                        
type alias R = 
  { field : () }                          
    --X      

type Box a 
  = Box a                                     
                                                       
map : (a -> b) -> Box a -> Box b                       
map f (Box a) = 
    Box (f a)                              
                                                       
main : Box R -> Box R                                  
main box =                                             
    let                                                
        f r = 
          { r | field = () }                       
                --^                               
    in                                                 
    map f box                                          
`;
    await testBase.testDefinition(source);
  });

  xit(`test multi resolve`, async () => {
    const source = `
type alias R = { field : () }
type alias S = { field : () }
first : () -> () -> ()
first a _ = a
main : R -> S -> ()
main r s =
  let
    nest t = t.field
               --^                               
  in
  first (nest r) (nest s)        
    `;
    await testBase.testDefinition(source);
  });

  it(`test ref to destructuring in function parameter`, async () => {
    const source = `
type alias R = { field : () }
                 --X
main : R -> ()
main { field } = field
       --^
`;
    await testBase.testDefinition(source);
  });

  it(`test value ref through destructuring in function parameter`, async () => {
    const source = `
type alias R = { field : () }
                 --X
main : R -> ()
main { field } = field
                 --^
`;
    await testBase.testDefinition(source);
  });

  it(`test ref through destructuring in case`, async () => {
    const source = `
type alias R = { field : () }
                 --X
main : R -> ()
main r = 
  case r of
      { field } -> field
                    --^
`;
    await testBase.testDefinition(source);
  });

  it(`test ref to destructuring in case`, async () => {
    const source = `
type alias R = { field : () }
                 --X
main : R -> ()
main r = 
  case r of
      { field } -> field
        --^
`;
    await testBase.testDefinition(source);
  });

  it(`test repeated reference in list 1`, async () => {
    const source = `
type alias R = { field : () }
                 --X
main : List R
main = 
    [ { field = () }
        --^                               
    ]                           
`;
    await testBase.testDefinition(source);
  });

  it(`test repeated reference in list 2`, async () => {
    const source = `
type alias R = { field : () }
                 --X
main : List R
main = 
    [ { field = () }
    , { field = () }
        --^                               
    ]
`;
    await testBase.testDefinition(source);
  });

  it(`test repeated reference in list 3`, async () => {
    const source = `
type alias R = { field : () }
                 --X
main : List R
main = 
    [ { field = () }
    , { field = () }
    , { field = () }
        --^                               
    ]
`;
    await testBase.testDefinition(source);
  });

  it(`test nested extension aliases with function in type variable passed through another variable via forward pipeline`, async () => {
    const source = `
infix left  0 (|>) = apR
apR : a -> (a -> b) -> b
apR x f = f x
type alias R = { field : () }
                  --X
type alias Outer r = { r : Type (r -> r) }
type Type a = Type a
foo : Outer r -> Outer r
foo r = r
main : Outer R
main =
    { r = Type (\\r -> { r | field = () }) } |> foo 
                             --^                               
`;
    await testBase.testDefinition(source);
  });
});
