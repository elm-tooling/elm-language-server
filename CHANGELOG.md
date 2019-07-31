# Change Log

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
