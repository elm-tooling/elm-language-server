# Change Log

## 1.13.2

- Fix bug on file open
- Fix some type inference bugs
- Reset diagnostics for elmMake and elmAnalyze

## 1.13.1

- Fixed some type inference bugs

## 1.13.0

- Debounce sending diagnostics to the client
- Support finding field references and renaming
- Tree sitter parser improvements
- Handle negate expressions in type inference

## 1.12.2

- Fixed problem with communication for clients like VIM

## 1.12.1

- Fixed hovers for functions not showing up
- Fixed hovers for let definitions not showing if they have no type annotation
- Fixed a problem with node 10

## 1.12.0

- Make entrypoints configurable via elm-tooling.json
- Default elmAnalyseTrigger to never
- Added type inference
- Added type inference diagnostics for missing top level type annotations
- Added codeActions to infer annotations for functions
- Added goto definition and references for ports
- Create function declaration from usage
- More goto definition improvements
- Tree sitter now parses the files incrementally after the initial scan

## 1.11.0

- Improve definition for conflicting module/type names
- Various completion sorting tweaks
- Add parameter names to hovers/autocompletions for functions
- Improve module renames to also rename the file
- Add support renaming files in the vscode file explorer
- Use dependency injection to resolve classes

## 1.10.0

- Add value completions for non-imported modules
- Add definition handling for type variables
- Improved annotation/function name completions
- Various other completion improvements
- Fixed wrong wildcard shadowing rules
- Update tree sitter and other dependencies

## 1.9.1

- Revert "We changed the used globbing lib to a slightly faster one"

## 1.9.0

- We changed the used globbing lib to a slightly faster one
- Improved sorting of autoimport completions
- Don't complete in comments
- Separate snippets and keywords by type and show them in different circumstances
- Added completions for module values or possible submodules
- Added function completion for used but not declared function
- Fix for possible exception on completion
- Fix external modules not being found in some cases
- Fix record completions interfering with Module completions

## 1.8.3

- Fixed bug that was causing problems with completions from external packages

## 1.8.2

- Fix problem on import generation for windows systems

## 1.8.1

- Fix imports form other files not showing up in some cases

## 1.8.0

- Add completions for possible imports
- Scaffold case branches (use the new snippet and code action)
- Sort auto imports by closest similar modules
- Improve record field access completions
- Remove exposing subscriptions in Browser.sandbox snippet
- Fixed references to shadowed modules being potentially wrong
- Don't use flatmap to be node 10 compatible (caused problems for npm package users)
- Update elm-analyse
- Update dependencies

## 1.7.2

- Add record access completions for types and nested types
- Fix elm.json being ignored when paths are similar to another
- Fix record field jump to definitions
- Fix record field completions in some cases
- Fix auto import not suggesting modules with multiple prefixes
- Fix error where qualified names were not taken into account for definition resolving
- Updated package rankings

## 1.7.1

- Fix exposing list params not getting completed for imports
- Fix possible imports for packages not in ranking list
- Prevent imports from getting out of date

## 1.7.0

- Add diagnostic on unknown symbols and offer importing via codeAction (needs the file to be save and the compiler to run)
- Support exposing/unexposing functions and types via codeLense or codeAction
- Add support for move function refactoring
- Fix init taking long when using files with thousands of functions
- Add new snippet for if-else conditions
- Better completions for record update syntax
- Added completions for basic keywords like if, then, else, let etc.
- Improved hovers for types aliases
- Added jump to definition for fields of records
- Better handling of invalid renames

## 1.6.3

- Improved goto definition, find references and rename for anonymous functions, let definitions, destructured functions in let definitions, destructured parameters and case branches
- Show comment from type for type constructor

## 1.6.2

- Fade unused symbols
- Improved some codeAction texts

## 1.6.1

- Fix problem with formatting

## 1.6.0

- Add selection range handling
- Add progress indicator for startup
- Improved package ratings
- Remove deleted files from diagnostics
- Fix errors that could happen on startup
- Fix interactions not working after ( or similar characters

## 1.5.0

- Add support for multiple elm.json files in a single project directory tree
- Fix possible issue with server not recognising files in non-normalized
  source-directories (containing "..").
- Completions are now ranked better
- Show code for types in completions/hovers
- Fix elm analyse warnings not getting cleaned up correctly

## 1.4.6

- Fix type annotations not showing for local parameters
- Fix files without module declaration not getting added to our index
- Fix rename devouring Module prefixes

## 1.4.5

- Improved completions for type annotations, functions, import and module statements
- Fixed a bug where files without imports would not index the virtual imports

## 1.4.4

- Add more feedback on init for common errors
- Make sure a file without permissions doesn't crash the server
- `-v` to print version was not working

## 1.4.3

- Remove completions committing when space is pressed

## 1.4.2

- Completions should be much nicer to use now
- Improved performance for codeLenses
- Do not crash when the elm compiler generates invalid json
- Fix codeLens bug showing wrong count for types
- Print version with `-v` or `--version`

## 1.4.1

- Fallback to old configuration flow when clients don't support the new one
- Add elm make code actions for more compiler errors

## 1.4.0

- Various improvements to folding
- Process files on init in parallel
- Reference codelenses can now be clicked
- Fixed some problems with references not being correct
- Get rid of crypto deprecation warnings

- Updated tree-sitter syntax parsing - Add glsl parsing - Nest if/then/else expressions - Let and in now correctly nest - Change when block_comments are set, should now be better for annotations - End functions/case as early as possible, so they don't include whitespace

## 1.3.2

- Fixed case where elm-format might have strip the last line from you files

## 1.3.1

- Fix problem on init on windows systems

## 1.3.0

- Updated and clarified the readme in multiple ways, also added sublime text instructions
- Reworked settings and detection of `elm`, `elm-test` and `elm-format`
- Server figures out the elm version automatically
- Correctly detect cursors on or after the last character of a token
- elm.json detection is now handled by the server, the setting is deprecated
- Handle elm libraries better, we failed to load the correct deps before this
- You can configure when to run elm-analyse via the setting `elmAnalyseTrigger` ("change" | "save" | "never")
- Some cleanups for cases where the elm compiler does not respond with a json

## 1.2.2

- Fixed document changes causing high cpu load
- Included a fix for a memory out of bounds error that could occur
- Removed `runtime` option, that is now unneeded due to us using wasm
- Use normal file path rather than file:// protocol when reading a file

## 1.2.1

- Revert determination of used elm compiler version, as it was causing file open to go unnoticed

## 1.2.0

- Use WASM version of tree-sitter and updated tree-sitter - This mean multiple parsing improvements
- Added completions for methods defined in a let scope
- Added completions from case branches
- Added code actions for some rename suggestions from elm make
- Removed the ability to run elm-test for now, as it was problematic
- Determine the used elm version, so that we're ready for 0.19.1
- Cleaned up the symbols that we show in the outline or when searching
- Fixed multiple problems with multi workspace useage
- Fixed type references including (..) on search or rename
- Fixed elm make not reporting the correct path in some edgecases

## 1.1.1

- Initial release
