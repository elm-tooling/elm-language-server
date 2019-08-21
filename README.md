# elm-language-server

[![Build Status](https://travis-ci.org/elm-tooling/elm-language-server.svg?branch=master)](https://travis-ci.org/elm-tooling/elm-language-server)

This is the language server implementation for the Elm programming language.

## Installation

Note for VSCode users: The [plugin](https://github.com/elm-tooling/elm-language-client-vscode) contains the language-server. No installation necessary.

The server can be installed via `npm` (or from source).

```sh
npm install -g @elm-tooling/elm-language-server
```

Then, you should be able to run the language server with the following command:

```sh
elm-language-server --stdio
```

Follow the instructions below to integrate the language server into your editor.

### Alternative: Compile and install from source

First, clone this repo and compile it. `npm link` will add `elm-language-server` to the `PATH`.

```sh
git clone git@github.com:elm-tooling/elm-language-server.git
cd elm-language-server
npm install
npm run compile
npm link
```

## Requirements

You will need to install `elm` and `elm-test` to get all diagnostics and `elm-format` for formatting.

```sh
npm install -g elm elm-test elm-format
```

Or use local versions from your `node_modules` directory, if you want to do that you need to set the paths, via the settings (e.g. set `elmPath` to `./node_modules/.bin/elm`).

## Features

Supports Elm 0.19

| Feature          | Description                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagnostics      | Provided via `elm`, `elm-test` and `elm-analyse`                                                                                                    |
| Formatting       | Provided via `elm-format` and postprocessed to only return a diff of changes. This way it should not be as intrusive as running `elm-format` normal |
| codeLenses       | Currently only shows if a type alias, custom type or function is exposed from that module                                                           |
| completions      | Show completions for the current file and snippets                                                                                                  |
| definitions      | Enables you to jump to the definition of a type alias, module, custom type or function                                                              |
| documentSymbols  | Identifies all symbols in a document.                                                                                                               |
| folding          | Let's you fold the code on certain Elm constructs                                                                                                   |
| hover            | Shows type annotations and documentation for a type alias, module, custom type or function                                                          |
| references       | Lists all references to a type alias, module, custom type or function                                                                               |
| rename           | Enables you to rename a type alias, module, custom type or function                                                                                 |
| workspaceSymbols | Identifies all symbols in the current workspace                                                                                                     |

## Server Settings

This server contributes the following settings:

- `elmLS.trace.server`: Enable/disable trace logging of client and server communication
- `elmLS.elmPath`: The path to your `elm` executable.
- `elmLS.elmFormatPath`: The path to your `elm-format` executable.
- `elmLS.elmTestPath`: The path to your `elm-test` executable.
- `elmLS.elmAnalyseTrigger`: `elm-analyse` executed on `'change'`, `'save'` or `'never'` (default: `'change'`)

Settings may need a restart to be applied.

## Editor Support

| Editor                                                                |    Diagnostics     |     Formatting     |    Code Lenses     |    Completions     |    Definitions     |  Document Symbols  |      Folding       |       Hover        |     References     |       Rename       | Workspace Symbols  |
| --------------------------------------------------------------------- | :----------------: | :----------------: | :----------------: | :----------------: | :----------------: | :----------------: | :----------------: | :----------------: | :----------------: | :----------------: | :----------------: |
| [VSCode](https://github.com/elm-tooling/elm-language-server#vscode)   | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: |
| [VIM CoC](https://github.com/elm-tooling/elm-language-server#cocnvim) | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: |
| [VIM ALE](https://github.com/elm-tooling/elm-language-server#ale)     | :heavy_check_mark: |        :x:         |        :x:         | :heavy_check_mark: | :heavy_check_mark: |        :x:         |        :x:         | :heavy_check_mark: | :heavy_check_mark: |        :x:         | :heavy_check_mark: |
| [Kakoune](https://github.com/elm-tooling/elm-language-server#kak-lsp) | :heavy_check_mark: | :heavy_check_mark: |  :grey_question:   | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: |  :grey_question:   | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: |  :grey_question:   |
| [Emacs](https://github.com/elm-tooling/elm-language-server#emacs)     | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: |  :grey_question:   | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: |
| [Sublime](https://github.com/elm-tooling/elm-language-server#sublime) | :heavy_check_mark: | :heavy_check_mark: |        :x:         | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: |

### VSCode

Just install the [`elm-tooling/elm-language-client-vscode`](https://github.com/elm-tooling/elm-language-client-vscode) plugin from the [VSCode MarketPlace](https://marketplace.visualstudio.com/items?itemName=Elmtooling.elm-ls-vscode)

### Vim

[General Elm Vim tooling](https://github.com/elm-tooling/elm-vim)

#### coc.nvim

To enable support with [coc.nvim](https://github.com/neoclide/coc.nvim), run `:CocConfig` and add the language server config below.

If needed, you can set the paths to `elm`, `elm-test` and `elm-format` with the `elmPath`, `elmTestPath` and `elmFormatPath` variables.

```jsonc
{
  "languageserver": {
    "elmLS": {
      "command": "elm-language-server",
      "args": ["--stdio"],
      "filetypes": ["elm"],
      "rootPatterns": ["elm.json"],
      "initializationOptions": {
        "elmPath": "elm",
        "elmFormatPath": "elm-format",
        "elmTestPath": "elm-test",
        "elmAnalyseTrigger": "change"
      }
    }
  },
  // If you use neovim you can enable codelenses with this
  "codeLens.enable": true
}
```

Much of this is covered in the [Example vim configuration](https://github.com/neoclide/coc.nvim#example-vim-configuration) section in Coc's readme.

| Feature           | How to use it                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Diagnostics       | `:CocList diagnostics`<br />Configure refresh with `"diagnostic.refreshAfterSave": false`                                                                                |
| Formatting        | `:call CocAction('format')`                                                                                                                                              |
| CodeLenses        | Requires Neovim. Add `"coc.preferences.codeLens.enable": true` to your `coc-settings.json` through `:CocConfig`                                                          |
| Completions       | On by default, see [Completion with sources](https://github.com/neoclide/coc.nvim/wiki/Completion-with-sources) for customizations                                       |
| Definitions       | Provided as `<Plug>` mapping so that you can set it yourself, e.g. <br /> `nmap <silent> gd <Plug>(coc-definition)` <br/> `nmap <silent> gy <Plug>(coc-type-definition)` |
| DocumentSymbols   | `:CocList outline`                                                                                                                                                       |
| Folding           | You must `set foldmethod=manual` in your `vimrc`, one set Coc will handle folding with the usual commands, `zc`, `zo`, etc                                               |
| Hover             | `:call CocAction('doHover')`                                                                                                                                             |
| References        | Provided as a `<Plug>` mapping, e.g. `nmap <silent> gr <Plug>(coc-references)`                                                                                           |
| Rename            | Provided as a `<Plug>` mapping, e.g. `nmap <leader>rn <Plug>(coc-rename)`                                                                                                |
| Workspace Symbols | `:CocList symbols`                                                                                                                                                       |

#### ALE

[ALE](https://github.com/w0rp/ale) contains the `elm_ls` linter.

```
let g:ale_linters = { 'elm': ['elm_ls'] }
```

If needed, you can set the paths to `elm`, `elm-test` and `elm-format`. The configuration can be [found here](https://github.com/w0rp/ale/blob/master/doc/ale-elm.txt)

```
let g:ale_elm_ls_use_global = 1
let g:ale_elm_ls_elm_path = "/path/to/elm"
let g:ale_elm_ls_elm_format_path = "/path/to/elm-format"
let g:ale_elm_ls_elm_test_path = "/path/to/elm-test"
let g:ale_elm_ls_executable = "/path/to/elm-language-server"
```

| Feature           | How to use it                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Diagnostics       | `:ALENext`/`:ALEPrevious`<br />Configure refresh with `let g:ale_lint_on_text_changed = 0`<br />`let g:ale_lint_on_insert_leave = 1` <br /> `let g:ale_lint_on_save = 1` |
| Formatting        | ALE doesn't currently support this through the language server integration, but `elm-format` is a supported ALE Fixer                                                    |
| CodeLenses        | Not currently supported                                                                                                                                                  |
| Completions       | On by default, see `:h ale-completion` for more info                                                                                                                     |
| Definitions       | `:ALEGoToDefinition`, `:ALEGoToTypeDefinition`, see `:h ale-go-to-definition` and `:h ale-go-to-type-definition`                                                         |
| DocumentSymbols   | Only workspace symbols are currently supported                                                                                                                           |
| Folding           | Not currently supported                                                                                                                                                  |
| Hover             | `:ALEHover`                                                                                                                                                              |
| References        | `:ALEFindReferences`                                                                                                                                                     |
| Rename            | Not currently supported                                                                                                                                                  |
| Workspace Symbols | `:ALESymbolSearch <query>`                                                                                                                                               |

### Kakoune

#### kak-lsp

First install [kak-lsp](https://github.com/ul/kak-lsp), and enable it in the kakrc. One way would be to add these lines to your .config/kak/kakrc file:

```sh
eval %sh{kak-lsp --kakoune -s $kak_session}
lsp-enable
```

Then, assuming installation of `elm-language-server`, `elm-format`, and `elm-test`, add this section to your `.config/kak-lsp/kak-lsp.toml` file:

```toml
[language.elm]
filetypes = ["elm"]
roots = ["elm.json"]
command = "elm-language-server"
args = ["--stdio"]

[language.elm.initialization_options]
elmPath = "elm"
elmFormatPath = "elm-format"
elmTestPath = "elm-test"
elmAnalyseTrigger = "change"
```

### Emacs

The language client is included in [lsp-mode](https://github.com/emacs-lsp/lsp-mode), specifically [here](https://github.com/emacs-lsp/lsp-mode/blob/master/lsp-elm.el). See specifically [this section](https://github.com/emacs-lsp/lsp-mode#use-package) for a minimal use-package configuration for lsp-mode.

### Sublime

First install the language server via npm `npm i -g @elm-tooling/elm-language-server`
Install [Elm Syntax Highlighting](https://packagecontrol.io/packages/Elm%20Syntax%20Highlighting) from Package Control.
Then we also need the [LSP Package](https://packagecontrol.io/packages/LSP) to be able to connect Sublime to the Language Server.

Add this to your LSP settings under the `clients` node:

```json
"elm": {
    "command": [
        "elm-language-server",
        "--stdio"
    ],
    "enabled": true,
    "languageId": "elm",
    "scopes":
    [
        "source.elm"
    ],
    "syntaxes":
    [
        "Packages/Elm Syntax Highlighting/src/elm.sublime-syntax"
    ],
    "initializationOptions": {
        "elmPath": "elm",
        "elmFormatPath": "elm-format",
        "elmTestPath": "elm-test",
        "elmAnalyseTrigger": "change"
    }
}
```

You should now be able to use the integrations from Sublime.

## Awesome libraries this is based on

- [elm-analyse](https://github.com/stil4m/elm-analyse)
- [elm-format](https://github.com/avh4/elm-format)
- [elm-test](https://github.com/rtfeldman/node-test-runner)
- [tree-sitter-elm](https://github.com/Razzeee/tree-sitter-elm)

## Contributing

Please do :)
As the best thing about a language server is that multiple clients will improve that way.
