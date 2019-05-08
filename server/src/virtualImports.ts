import Parser, { SyntaxNode } from "tree-sitter";
import TreeSitterElm from "tree-sitter-elm";

export interface IVirtualImports {
  imports: SyntaxNode[] | undefined;
  updateVirtualImports(): void;
}

export class VirtualImports implements IVirtualImports {
  public imports: SyntaxNode[] | undefined = undefined;
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(TreeSitterElm);
  }

  public updateVirtualImports(): void {
    const virtualImports = `
    import Basics exposing (..)
import List exposing (List, (::))
import Maybe exposing (Maybe(..))
import Result exposing (Result(..))
import String exposing (String)
import Char exposing (Char)
import Tuple

import Debug

import Platform exposing ( Program )
import Platform.Cmd as Cmd exposing ( Cmd )
import Platform.Sub as Sub exposing ( Sub )
    `;

    const importTree = this.parser.parse(virtualImports);

    if (importTree.rootNode.children.length > 0) {
      this.imports = importTree.rootNode.children;
    } else {
      this.imports = undefined;
    }
  }
}
