# elm-vscode-ls

This vscode extension is in development and might be lacking features you know working from `vscode-elm`.

## Features

- Diagnostics via elm-make and elm-analyse
- Formatting via elm-format

## Extension Settings

This extension contributes the following settings:

- `elmLS.trace.server`: Enable/disable trace logging of client and server communication
- `elmLS.elmPath`: The path to your elm executeable.
- `elmLS.elmFormatPath`: The path to your elm-format executeable.

## Editor Support

### Vim

#### coc.nvim

To enable support with [coc.nvim](https://github.com/neoclide/coc.nvim), run `:CocConfig` and add the language server config below.

If needed, you can set the paths to `elm` and `elm-format` with the `elmPath` and `elmFormatPath` variables.

```
{
  "languageserver": {
    "elmLS": {
      "command": "elm-ls",
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

If needed, you can set the paths to `elm` and `elm-format` with these variables:
```
let g:ale_elm_ls_elm_format_path = "/path/to/elm-format"
let g:ale_elm_ls_elm_path = "/path/to/elm"
```
