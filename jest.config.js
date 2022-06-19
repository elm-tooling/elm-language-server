/** @type {import('jest').Config} */
export default {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/?(*.)+(spec|test).[tj]s?(x)"],
  collectCoverage: true,
  coverageReporters: ["lcov", "text", "json"],
  setupFilesAfterEnv: ["<rootDir>/test/jest.setup.ts"],
  coveragePathIgnorePatterns: ["<rootDir>/test/"],
};
