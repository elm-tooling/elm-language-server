/* eslint-disable @typescript-eslint/naming-convention */
import "web-tree-sitter";

declare module "web-tree-sitter" {
  export interface Tree {
    uri: string;
  }
}
