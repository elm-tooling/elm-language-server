# elm-language-server

This is the language server implementation for the Elm programming language.

You will need to install `elm`, `elm-test` and `elm-format`, to get all diagnostics.

```sh
npm install -g elm elm-test elm-format
```

Or use them from your `node_modules`, if you want to do that you need to set the paths, via the settings.

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

## Installation

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

First, clone this repo and compile it. `npm link` will add `elm-language-server` to the PATH.

```sh
git clone git@github.com:elm-tooling/elm-language-server.git
cd elm-language-server
npm install
npm run compile
npm link
```

## Editor Support

| Editor  | Setup Instructions                                                 | Source Code                                                       | Diagnostics        | Formatting         | CodeLenses         | Completions        | Definitions        | DocumentSymbols    | Folding            | Hover              | References         | Rename             | Workspace Symbols  |
| ------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ |
| VSCode  | [Link](https://github.com/elm-tooling/elm-language-server#vscode)  | [Link](https://github.com/elm-tooling/elm-language-client-vscode) | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: |
| VIM CoC | [Link](https://github.com/elm-tooling/elm-language-server#cocnvim) |                                                                   | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: |
| VIM ALE | [Link](https://github.com/elm-tooling/elm-language-server#ale)     |                                                                   | :heavy_check_mark: | :x:                | :x:                | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :x:                | :heavy_check_mark: | :heavy_check_mark: | :x:                | :heavy_check_mark: |
| Kakoune | [Link](https://github.com/elm-tooling/elm-language-server#kak-lsp) |                                                                   | :heavy_check_mark: | :heavy_check_mark: | :grey_question:    | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :grey_question:    | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :grey_question:    |

### VSCode

Just install the plugin from the [VSCode MarketPlace](https://marketplace.visualstudio.com/items?itemName=Elmtooling.elm-ls-vscode)

### Vim

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
        "runtime": "node",
        "elmPath": "elm",
        "elmFormatPath": "elm-format",
        "elmTestPath": "elm-test"
      }
    }
  },
  // If you use neovim you can enable codelenses with this
  "coc.preferences.codeLens.enable": true
}
```

Much of this is covered in the [Example vim configuration](https://github.com/neoclide/coc.nvim#example-vim-configuration) section in Coc's readme.

| Feature           | How to use it                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Diagnostics       | `:CocList diagnostics`                                                                                                                                                   |
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

For [ALE](https://github.com/w0rp/ale) support.

| Package Manager                                   | Command                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [Vim-Plug](https://github.com/junegunn/vim-plug)  | `Plug 'antew/vim-elm-language-server'`                                                        |
| [Vundle](https://github.com/VundleVim/Vundle.vim) | `Plugin 'antew/vim-elm-language-server'`                                                      |
| [Pathogen](https://github.com/tpope/vim-pathogen) | <pre>cd ~/.vim/bundle<br>git clone https://github.com/antew/vim-elm-language-server.git</pre> |

If needed, you can set the paths to `elm`, `elm-test` and `elm-format`. The configuration can be [found here](https://github.com/antew/vim-elm-language-server#configuration)

| Feature           | How to use it                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| Diagnostics       | `:ALENext`/`:ALEPrevious`                                                                                             |
| Formatting        | ALE doesn't currently support this through the language server integration, but `elm-format` is a supported ALE Fixer |
| CodeLenses        | Not currently supported                                                                                               |
| Completions       | On by default, see `:h ale-completion` for more info                                                                  |
| Definitions       | `:ALEGoToDefinition`, `:ALEGoToTypeDefinition`, see `:h ale-go-to-definition` and `:h ale-go-to-type-definition`      |
| DocumentSymbols   | `ALESymbolSearch <query>`, see `:h ale-symbol-search` for more info                                                   |
| Folding           | Not currently supported                                                                                               |
| Hover             | `:ALEHover`                                                                                                           |
| References        | `:ALEFindReferences`                                                                                                  |
| Rename            | Not currently supported                                                                                               |
| Workspace Symbols | `:ALESymbolSearch <query>`                                                                                            |

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
runtime = "node"
elmPath = "elm"
elmFormatPath = "elm-format"
elmTestPath = "elm-test"
```

# Awesome libraries this is based on

- [elm-analyse](https://github.com/stil4m/elm-analyser)
- [elm-format](https://github.com/avh4/elm-format)
- [elm-test](https://github.com/rtfeldman/node-test-runner)
- [tree-sitter-elm](https://github.com/Razzeee/tree-sitter-elm)

# Contributing

Please do :)
As the best thing about a language server is that multiple clients will improve that way.
