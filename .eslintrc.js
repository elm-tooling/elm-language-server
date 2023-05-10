module.exports = {
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:prettier/recommended",
  ],
  globals: {
    Atomics: "readonly",
    SharedArrayBuffer: "readonly",
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json", "./tests/tsconfig.json"],
  },
  plugins: ["@typescript-eslint", "prettier"],
  ignorePatterns: ["*.test.ts", "jest.config.js", ".eslintrc.js"],
  rules: {
    "prettier/prettier": "error",
    "no-prototype-builtins": "warn",
    "no-case-declarations": "warn",
    "no-use-before-define": "off",
    "no-async-promise-executor": "warn",
    "@typescript-eslint/no-misused-promises": "warn",
    "@typescript-eslint/unbound-method": "warn",
    "@typescript-eslint/no-var-requires": "warn",
    "@typescript-eslint/no-use-before-define": "off",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-non-null-assertion": "warn",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-inferrable-types": "warn",
    "@typescript-eslint/restrict-template-expressions": "warn",
    "@typescript-eslint/no-unsafe-member-access": "warn",
    "@typescript-eslint/no-unsafe-assignment": "warn",
    "@typescript-eslint/no-unsafe-call": "warn",
    "@typescript-eslint/naming-convention": [
      "error",
      {
        selector: "interface",
        format: ["PascalCase"],
        prefix: ["I"],
      },
    ],
  },
};
