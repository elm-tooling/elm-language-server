# elm-vscode-ls

This vscode extension is in development and might be lacking features you know working from `vscode-elm`.

## Features

- Diagnostics via elm-make and elm-analyse
- Formatting via elm-format

## Extension Settings
This extension contributes the following settings:

* `elmLS.trace.server`: enable/disable trace logging of client and server communication

## Editor Support

### Vim

#### coc.nvim
To enable support with [coc.nvim](https://github.com/neoclide/coc.nvim), run `:CocConfig` and add the language server config below.

```
{
  "languageserver": {
    "elm-ls": {
      "command": "elm-ls",
      "args": ["--stdio"],
      "filetypes": ["elm"],
      "rootPatterns": ["elm.json"],
      "initializationOptions": {
        "runtime": "node"
      },
      "settings": {}
    }
  }
}
```

#### ALE
For [ALE](https://github.com/w0rp/ale) support.

| Package Manager | Command |
|---|---|
|[Vim-Plug](https://github.com/junegunn/vim-plug)|`Plug 'antew/vim-elm-language-server'`|
|[Vundle](https://github.com/VundleVim/Vundle.vim)|`Plugin 'antew/vim-elm-language-server'`|
|[Pathogen](https://github.com/tpope/vim-pathogen)|<pre>cd ~/.vim/bundle<br>git clone https://github.com/antew/vim-elm-language-server.git</pre>|
