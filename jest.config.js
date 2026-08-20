export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testMatch: ["**/?(*.)+(spec|test).[tj]s?(x)"],
  collectCoverage: true,
  coverageReporters: ["lcov", "text", "json"],
  setupFilesAfterEnv: ["<rootDir>/test/jest.setup.ts"],
  coveragePathIgnorePatterns: ["<rootDir>/test/"],
};
