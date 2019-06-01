# elm-language-server

This is the language server implementation for the Elm programming language.

## Features

| Feature          | Description                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagnostics      | Provided via `elm-make` and `elm-analyse`                                                                                                           |
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

## Editor Support

| Editor | Link                                                                                        | Setup Instructions      | Supported Features       | Source Code                                                       |
| ------ | ------------------------------------------------------------------------------------------- | ----------------------- | ------------------------ | ----------------------------------------------------------------- |
| VSCode | [MarketPlace](https://marketplace.visualstudio.com/items?itemName=Elmtooling.elm-ls-vscode) | Just install the plugin | All features should work | [Link](https://github.com/elm-tooling/elm-language-client-vscode) |

### Vim

#### coc.nvim

To enable support with [coc.nvim](https://github.com/neoclide/coc.nvim), run `:CocConfig` and add the language server config below.

If needed, you can set the paths to `elm` and `elm-format` with the `elmPath` and `elmFormatPath` variables.

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
        "elmFormatPath": "elm-format"
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

If needed, you can set the paths to `elm` and `elm-format`. The configuration can be [found here](https://github.com/antew/vim-elm-language-server#configuration)
