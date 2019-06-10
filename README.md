# elm-language-server

This is the language server implementation for the Elm programming language.

You will need to install `elm`, `elm-test` and `elm-format`, to get all diagnostics.

```shell
npm install -g elm
npm install -g elm-test
npm install -g elm-format
```

Or use them from your `node_modules`, if you want to do that you need to set the paths, via the settings.

## Features

Supports elm 0.19

| Feature          | Description                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagnostics      | Provided via `elm`, `elm-test` and `elm-analyse`                                                                                                    |
| Formatting       | Provided via `elm-format` and postprocessed to only return a diff of changes. This way it should not be as intrusive as running `elm-format` normal |
| codeLenses       | Currently only shows if a type alias, custom type or function is exposed from that module                                                           |
| completions      | Show completions for the current file and snippets                                                                                                  |
| definitions      | Enables you to jump to the definition of a type alias, module, custom type or function                                                              |
| documentSymbols  | Identifies all symbols in a document.                                                                                                               |
| folding          | Let's you fold the code on certain elm constructs                                                                                                   |
| hover            | Shows type annotations and documentation for a type alias, module, custom type or function                                                          |
| references       | Lists all references to a type alias, module, custom type or function                                                                               |
| rename           | Enables you to rename a type alias, module, custom type or function                                                                                 |
| workspaceSymbols | Identifies all symbols in the current workspace                                                                                                     |

## Server Settings

This server contributes the following settings:

- `elmLS.trace.server`: Enable/disable trace logging of client and server communication
- `elmLS.elmPath`: The path to your elm executeable.
- `elmLS.elmFormatPath`: The path to your elm-format executeable.
- `elmLS.elmTestPath`: The path to your elm-test executeable.

## Installation

First, clone this repo and compile it:

```sh
git clone git@github.com:elm-tooling/elm-language-server.git
cd elm-language-server
npm install
npm run compile
npm link
```

Then, you should be able to run the language server with the following command:

```sh
elm-language-server --stdio
```

Follow the instructions below to integrate the language server into your editor.

## Editor Support

| Editor | Link                                                                                        | Setup Instructions      | Supported Features       | Source Code                                                       |
| ------ | ------------------------------------------------------------------------------------------- | ----------------------- | ------------------------ | ----------------------------------------------------------------- |
| VSCode | [MarketPlace](https://marketplace.visualstudio.com/items?itemName=Elmtooling.elm-ls-vscode) | Just install the plugin | All features should work | [Link](https://github.com/elm-tooling/elm-language-client-vscode) |

### Vim

#### coc.nvim

To enable support with [coc.nvim](https://github.com/neoclide/coc.nvim), run `:CocConfig` and add the language server config below.

If needed, you can set the paths to `elm`, `elm-test` and `elm-format` with the `elmPath`, `elmTestPath` and `elmFormatPath` variables.

```
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
  }
}
```

#### ALE

For [ALE](https://github.com/w0rp/ale) support.

| Package Manager                                   | Command                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [Vim-Plug](https://github.com/junegunn/vim-plug)  | `Plug 'antew/vim-elm-language-server'`                                                        |
| [Vundle](https://github.com/VundleVim/Vundle.vim) | `Plugin 'antew/vim-elm-language-server'`                                                      |
| [Pathogen](https://github.com/tpope/vim-pathogen) | <pre>cd ~/.vim/bundle<br>git clone https://github.com/antew/vim-elm-language-server.git</pre> |

If needed, you can set the paths to `elm`, `elm-test` and `elm-format`. The configuration can be [found here](https://github.com/antew/vim-elm-language-server#configuration)


### Kakoune

#### kak-lsp

First install kak-lsp, and enable it - one way would be to add these lines to your .config/kak/kakrc file:

```
eval %sh{kak-lsp --kakoune -s $kak_session}
lsp-enable
```

Then, assuming installation of elm-language-server and optionally elm-format and elm-test, add this section to your .config/kak-lsp/kak-lsp.toml file:

```
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
