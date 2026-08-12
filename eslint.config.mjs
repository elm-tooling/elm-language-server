import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  {
    ignores: ["coverage/**", "out/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs["flat/recommended-type-checked"],
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./test/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-prototype-builtins": "warn",
      "no-case-declarations": "warn",
      "no-use-before-define": "off",
      "no-useless-assignment": "off",
      "no-async-promise-executor": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/unbound-method": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-use-before-define": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-inferrable-types": "warn",
      "@typescript-eslint/restrict-template-expressions": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/only-throw-error": "off",
      "@typescript-eslint/prefer-promise-reject-errors": "off",
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "interface",
          format: ["PascalCase"],
          custom: {
            regex: "^I[A-Z]",
            match: true,
          },
        },
      ],
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      "no-useless-escape": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/prefer-promise-reject-errors": "off",
      "@typescript-eslint/require-await": "warn",
    },
  },
  eslintConfigPrettier,
];
