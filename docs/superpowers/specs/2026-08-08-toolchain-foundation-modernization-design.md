# Toolchain Foundation Modernization

## Context

The language server already requires Node.js 22 and CI covers Node.js 22 and 24 on Linux, Windows, and macOS. Its development toolchain is older: TypeScript 5.3 targets ES2015, ESLint 8 uses legacy configuration, formatting runs as an ESLint rule, and several validation steps are implicit or duplicated between local scripts and CI.

The current baseline has 530 active passing tests and 8 skipped tests. Lint reports 26 Prettier errors and 44 warnings. Jest also reports an open resource after the test suite completes.

## Objective

Establish a modern, mutually supported TypeScript toolchain with explicit, reusable quality gates while preserving the package's runtime behavior, CommonJS module format, published entry points, and Node/browser build artifacts.

## Scope

### Dependencies

- Upgrade TypeScript to 5.9.3.
- Upgrade ESLint to 9.39.5.
- Upgrade `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` to 8.66.0.
- Upgrade Prettier, `eslint-config-prettier`, `ts-jest`, and other directly related development packages within release lines compatible with TypeScript 5.9, ESLint 9, and Jest 29.
- Keep Jest on 29.x.
- Remove `eslint-plugin-prettier`; formatting will no longer run inside ESLint.

If the latest release in one of these lines is incompatible, use the newest mutually supported release rather than adding a workaround.

### ESLint And Formatting

- Replace `.eslintrc.js` with `eslint.config.mjs`.
- Apply typed TypeScript linting to production and test TypeScript files.
- Preserve the intent and severity of existing correctness rules unless a replacement rule is required by the new configuration model.
- Add `format` as the mutating Prettier command and `format:check` as its non-mutating quality gate.
- Normalize formatting in checked-in TypeScript and configuration files.
- Require zero ESLint errors. Existing warning-level debt does not have to be eliminated in this pass, although correctness issues directly exposed by the migration should be fixed.

### TypeScript

- Raise the emitted language target and standard library baseline from ES2015 to ES2022.
- Retain CommonJS output and the current package entry points.
- Retain decorator and metadata behavior used by dependency injection.
- Consolidate duplicate compiler options where this does not blur the distinction between Node and browser builds.
- Keep separate Node and browser no-emit typechecks because they validate different platform APIs.
- Preserve the existing `out/node`, `out/browser`, and `out/common` artifact structure.

### Scripts And CI

- Add an explicit `typecheck` script covering the Node and browser projects.
- Add a non-mutating `check` script that composes typechecking, linting, and formatting verification.
- Keep compilation and tests as explicit commands because they produce artifacts and coverage respectively.
- Update the main CI workflow to invoke shared package scripts rather than duplicating their internal command sequences.
- Retain the Node.js 22 and 24 matrix on Linux, Windows, and macOS.
- Retain the CLI version smoke test after compilation and linking.

### Test Lifecycle

- Diagnose the resource responsible for Jest's open-handle warning.
- Close or dispose of the underlying resource in production or test lifecycle code, as appropriate.
- Do not suppress the warning with `forceExit` or an equivalent workaround.
- Add a targeted regression test only if the lifecycle fix changes behavior that is not already covered.

## Out Of Scope

- ESM migration or dual CommonJS/ESM publication.
- TypeScript 7, ESLint 10, and Jest 30.
- Runtime dependency major upgrades, including ESM-only versions of `chokidar`, `execa`, and `globby`.
- Language Server Protocol or tree-sitter major upgrades.
- Package export-map redesign.
- Unrelated source architecture refactoring.
- Eliminating every existing lint warning.

These items should be handled as separate modernization passes after the foundation is green.

## Implementation Sequence

1. Upgrade the mutually supported development dependencies and regenerate the lockfile.
2. Introduce flat ESLint configuration and independent Prettier scripts.
3. Update and consolidate TypeScript configuration, including the ES2022 target.
4. Normalize formatting and make only behavior-preserving lint compatibility fixes.
5. Add shared validation scripts and update CI to use them.
6. Diagnose and fix the Jest resource leak.
7. Run the complete acceptance suite.

Each step should pass its narrow validation command before proceeding to the full suite. If a dependency upgrade causes incompatibility, reduce only that dependency to the newest supported release and document the constraint in the implementation summary.

## Acceptance Criteria

- A clean install succeeds with `npm ci` on Node.js 22 and 24.
- `npm run compile` succeeds and preserves the existing output directory structure.
- `npm run typecheck` validates both Node and browser projects without emitting files.
- `npm run lint` exits successfully with zero errors.
- `npm run format:check` exits successfully.
- `npm test -- --runInBand` retains all 530 currently active passing tests and exits without an open-handle warning.
- `npm run check` runs the non-mutating local quality gates successfully.
- Linking the compiled package and running `elm-language-server --version` succeeds.
- The main CI matrix remains Node.js 22 and 24 across Ubuntu, Windows, and macOS.
- No published entry point, module format, runtime dependency major, or language-server behavior changes in this pass.

## Risks And Mitigations

- **Typed-lint rule changes:** Compare the new rule set with the old configuration and preserve rule severity rather than accepting a new preset blindly.
- **ES2022 output compatibility:** Node.js 22 is the declared minimum, and browser output is consumed in modern worker environments. Compile and typecheck both platform projects and retain their current library declarations.
- **Formatting noise:** Keep normalization mechanical and separate behavior changes when reviewing the diff.
- **Open-handle diagnosis expands scope:** Fix only the resource lifecycle causing the warning. If diagnosis reveals a broader architecture issue, record it for a later pass rather than refactoring unrelated subsystems.
- **CI drift:** Put reusable validation logic in package scripts and keep workflows as orchestration.
