module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/?(*.)+(spec|test).[tj]s?(x)"],
  collectCoverage: true,
  coverageReporters: ["lcov"],
  setupFilesAfterEnv: ["<rootDir>/test/jest.setup.ts"],
};
