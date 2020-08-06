import "reflect-metadata";
import { container } from "tsyringe";
import { IConnection } from "vscode-languageserver";
import { mockDeep } from "jest-mock-extended";

container.register("Connection", { useValue: mockDeep<IConnection>() });
container.register("ElmWorkspaces", { useValue: [] });
