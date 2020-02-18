import { CleanWebpackPlugin } from "clean-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import path from "path";
import { DefinePlugin } from "webpack";

module.exports = {
  devtool: "source-map",
  entry: "./src/index.ts",
  externals: {
    vscode: "commonjs vscode",
    "elm-analyse/dist/app/file-loading-ports.js":
      "elm-analyse/dist/app/file-loading-ports.js",
    "elm-analyse/dist/app/backend-elm.js":
      "elm-analyse/dist/app/backend-elm.js",
  },
  module: {
    rules: [
      {
        exclude: /node_modules/,
        test: /\.ts$/,
        use: ["shebang-loader", "ts-loader"],
      },
    ],
  },
  node: {
    __dirname: false,
  },
  output: {
    devtoolModuleFilenameTemplate: "../[resource-path]",
    filename: "index.js",
    libraryTarget: "commonjs2",
    path: path.resolve(__dirname, "out"),
  },
  plugins: [
    new DefinePlugin({ ELM_ANALYSE_VERSION: JSON.stringify("X.Y.Z") }),
    new ForkTsCheckerWebpackPlugin(),
    new CleanWebpackPlugin({
      cleanStaleWebpackAssets: false,
    }),
    // Workaround to Webpack not being able to figure out emscripten's environment export
    new CopyPlugin([
      { from: "node_modules/web-tree-sitter/tree-sitter.wasm" },
      { from: "tree-sitter-elm.wasm" },
    ]),
  ],
  resolve: {
    extensions: [".ts", ".js"],
  },
  target: "node",
};
