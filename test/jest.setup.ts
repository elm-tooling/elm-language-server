import { mockDeep } from "jest-mock-extended";
import "reflect-metadata";
import { container } from "tsyringe";
import { IConnection } from "vscode-languageserver";
import { Forest } from "../src/forest";

container.register("Connection", { useValue: mockDeep<IConnection>() });
container.register("ElmWorkspaces", { useValue: [] });
container.registerSingleton("Forest", Forest);
