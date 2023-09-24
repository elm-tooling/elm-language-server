# Change Log

## 2.7.3

- Fix type alias references when used as a record constructor
- Ensure initial diagnostics are sent
- Fix case statement constant binding inference
- Update dependencies

## 2.7.2

Skipped

## 2.7.1

- Add a code action for extracting a type alias
- Update packages ranking
- Support virtual file systems (for running in the browser)
- Handle when watched files are changed
- Register install package code action dynamically
- Improve how kernel modules are tracked
- Ensure that workspaces are initialized before findTests request
- Fix bug that causes a bad source file
- Fix regression that broke incremental tree parsing
- Start disposing resources on server exit
- Tree sitter parser improvements due to update
- Update dependencies

## 2.7.0

- Suggest auto import completions and code actions for module aliases
- Add auto import completions for ports
- Show module aliases in hover and completions type strings
- Improve sorting of completions for exposed values
- Fix for field references when the module is not imported
- Fix the extract function code action incorrectly computing parameters
- Fix union constructor type inference when there are comments between the arguments
- Fix some type inference bugs related to extensible records
- Support node 18
- Update dependencies

## 2.6.0

- Start using completion item label description for module name
- Add completions for destructured record patterns and ports
- Add function parameter record field completions
- Don't try to get code actions when there is a top level parsing error
- Fix move function refactor
- Fix expose being able to expose the same function multiple times
- Fix a bug with extract function parameter calculation
- Fix for reference count of function in a let, with a type annotation.
- Don't cache operator definitions, fixes a type inference error with `Parser.Advanced`

## 2.5.2

- Fix a bug that caused the language server to stop working

## 2.5.0

- Removed node 12 compatibility
- Update to new language server version
- Improve error handling for broken package cache
- Rework expose/unexpose code action
- Use `--compiler` option for elm-test when elmPath is specified
- Add expose/unexpose `type` with variants action
- Fix type inference of non-rigid number vars
- Fix elm review path handling on windows
- Small improvements to progress messaging
- Update dependencies

## 2.4.1

- Improve whitespace handling for `of` keyword
- Updated tree sitter parser to fix some parse errors

## 2.4.0

- Implement fuzzy matching when using the workspace symbol search
- Ignore suppressed elm-review errors
- Parsing improvements
- Fix references and renames being wrong in some edge case
- Fix edge case where type inference was not returning correct results
- Fix auto import when there are module docs and no imports
- Fix type inference for cases, that need more then 26 types
- Update dependencies

## 2.3.0

- Remove the need for "entrypoints" in elm-tooling.json
- Add a code action to add function argument from missing declaration
- Add a code action to add missing union constructors
- Add annotations from ports to hovers and suggestions
- "Add type annotation" can now be enabled/disabled via elm-analyse.json and will also honor excluded folders
- Fix type inference for empty record pattern
- Fix reporting when elm, elm-test or elm-review were not found
- Fix clients that don't provide incremental changes

## 2.2.1

- Add instructions for elm-review
- Add type variable references/renames
- Fix false positive for unnecessary list concat diagnostics
- Fix possible trailing slash on init (for Nova Editor)
- Update dependencies

## 2.2.0

- Add server handling to discover tests (vscode)
- Add basic elm-review integration, showing diagnostics and offer fixes (off by default, find it in the settings)
- Add code action to create function in another module
- Add completions for anonymous function params
- Change default for `singleFieldRecord` rule to be false
- Rework how we find test folders - will be only in `tests` for now
- Reword remove all unused code action
- Improve performance of files with a lot of possible imports
- Prefer "Add Type Annotation" code action, followed by "Expose function" code action
- Fix type alias wrongly being shown as unused
- Fix duplicate completions for type aliases and constructors
- Fix wrong reference of Union constructor to import with the same name
- Fix unused_pattern for empty constructs
- Update parser
- Update dependencies

## 2.1.0

- Drop node 10
- Update tree-sitter-elm, should improve parsing significantly
- Add code action to create missing record field
- Add code action to remove all unused in a file
- Add code action to remove unused functions
- Add code action to remove all unused code in a file
- Improve whitespace handling on removal of unused nodes
- Improved snippets for `Browser.`
- Reimplement diagnostics and code actions for missing case patterns
- Improve references
- Rework import definitions to be more like the compiler
- Add ambiguous type/value diagnostics
- Don't create diagnostic on duplicate imports
- Improve exposing completions
- Show completions for multiple modules if they share a name/alias
- Fix elm-format matcher for files that fail to parse
- Fix elmAnalyse excludedPath not working with relative paths
- Fix parsing of new files
- Fix inference for cons patterns with lists
- Fix unknown parameter used when calling elm-test
- Use text documents buffer to parse dirty files on auto server restart
- Improve logging and error texts on the binary error path
- Update dependencies

## 2.0.3

- Add setting to disable diagnostics on change
- Improve performance of unused diagnostic
- Improve completions
- Fix problem with type inference caching

## 2.0.2

- Updated dependency, so that Apple M1 based laptops should work
- Improve unused import diagnostics
- Fix the `disableElmLSDiagnostics` setting not working
- Don't crash if server fails to initialize
- Fix wrong display of fix record diff
- Handle kernel code usages better
- More type checker improvements

## 2.0.1

- Fixed test files not being recognized correctly on windows
- Fixed some type inference problems
- Fixed linked editing ranges breaking, when deleting a whole word
- Remove `file` entry from symbolproviders (Outline, Go to symbol and breadcrumbs)
- Don't show files from dependencies in WorkspaceSymbolProvider (Go to symbol in workspace)

## 2.0.0

### Features

- Enabled type checking diagnostics that update on document change. These include parsing errors, type mismatch errors, value not found errors, etc
- Support file events APIs (Previously VSCode only)

  - On file create, the module name will be inserted
  - On file rename, the module name and all references will be updated

- A new "extract function" code action. Select a complete expression and it can be extracted to a function in the top level or the enclosing let expression (if there is one)
- A new "install package" code action. When you try to import a module that is not installed, a code action will offer to install it. (we only check your local elm cache for possible packages and there is a setting to control skipping confirmation)
- Replaced elm-analyse with our own diagnostics, there might be missing rules for you due to this
- Show inferred type information on hovers
- Support linked editing ranges. When editing a function name, the type annotation name will auto rename, or vice versa (needs to be enabled in most clients)
- Watch elm.json for changes. The server will restart when a change is detected
- Run elm make on server init
- Improve record completions
- Ports now have codeLenses, can find references and have correct types on mouseover

### Bug Fixes

- Greatly improve performance of diagnostics and type inference
- Fix some type inference cases
- Fix module resolution to be more like how the compiler resolves modules
- Fix some incorrect unused value diagnostics
- Fix how errors from third party binaries are shown
- Fixed test dependencies being available in non test modules

### Other Changes

- Update package rankings
- Update our parser

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
