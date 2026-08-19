import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const outDir = dirname(fileURLToPath(import.meta.url));
