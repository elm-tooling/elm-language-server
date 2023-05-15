let _cwd = "/";

export const process = {
  cwd: (): string => _cwd,
  chdir: (newCwd: string): string => (_cwd = newCwd),
  env: {},
};

export const __dirname = "/";
