1. Update the changelog in `CHANGELOG.md`.
2. Run `npm run version-patch`, `npm run version-minor`, or `npm run version-major`.
3. Run `npm run check`, `npm run compile`, `npm test`, and `npm pack --dry-run`.
4. Push the code to GitHub and wait for CI to pass.
5. Create a GitHub release whose tag exactly matches the version in `package.json` (for example, `2.9.0`).
6. Update Nix upstream ([instructions](https://github.com/turboMaCk/nixpkgs/blob/98997bb48997b27287a2995460d2fb6e1db88de7/pkgs/development/compilers/elm/packages/README.md#upgrades)).
