/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

"use strict";

const path = require("path");
var webpack = require("webpack");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
var nodeExternals = require("webpack-node-externals");

module.exports = {
  mode: "none", // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
  target: "node", // extensions run in a node context
  node: {
    __dirname: false, // leave the __dirname-behaviour intact
  },
  resolve: {
    mainFields: ["module", "main"],
    extensions: [".ts", ".js"], // support ts-files and js-files
  },
  module: {
    noParse: /vscode-uri/,
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            // configure TypeScript loader:
            // * enable sources maps for end-to-end source maps
            loader: "ts-loader",
            options: {
              compilerOptions: {
                sourceMap: true,
                experimentalDecorators: true,
                emitDecoratorMetadata: true,
              },
            },
          },
          { loader: "shebang-loader" },
        ],
      },
    ],
  },
  externals: [nodeExternals()],
  // yes, really source maps
  devtool: "source-map",
  context: path.join(__dirname),
  entry: {
    extension: "./src/index.ts",
  },
  output: {
    filename: "index.js",
    path: path.join(__dirname, "out"),
    libraryTarget: "commonjs2",
    devtoolModuleFilenameTemplate: "../[resource-path]",
  },
  plugins: [
    new ForkTsCheckerWebpackPlugin(),
    new CleanWebpackPlugin({
      cleanStaleWebpackAssets: false,
    }),
    // Workaround to Webpack not being able to figure out emscripten's environment export
    new CopyPlugin({
      patterns: [
        { from: "node_modules/web-tree-sitter/tree-sitter.wasm" },
        { from: "tree-sitter-elm.wasm" },
      ],
    }),
  ],
};
