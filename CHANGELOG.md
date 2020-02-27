# Change Log

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
