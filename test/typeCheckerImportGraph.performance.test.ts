import { performance } from "perf_hooks";
import { getTransitiveImportingModules } from "../src/compiler/typeChecker";

interface IStressModule {
  uri: string;
}

const NUMBER_OF_LAYERS = 24;
const MODULES_PER_LAYER = 24;
const WARMUP_ITERATIONS = 5;
const BENCHMARK_ITERATIONS = 20;
const FUNCTIONAL_TARGET_MS = 10;
const EXPECTED_MODULES = NUMBER_OF_LAYERS * MODULES_PER_LAYER;

function createStressGraph(): {
  importModuleGraph: Map<string, IStressModule[]>;
  sourceFile: IStressModule;
} {
  const sourceFile = { uri: "Root" };
  const layers = Array.from({ length: NUMBER_OF_LAYERS }, (_, layer) =>
    Array.from({ length: MODULES_PER_LAYER }, (_, module) => ({
      uri: `Layer${layer}.Module${module}`,
    })),
  );
  const importModuleGraph = new Map<string, IStressModule[]>();

  importModuleGraph.set(sourceFile.uri, layers[0]);

  layers.forEach((layer, layerIndex) => {
    const nextLayer = layers[layerIndex + 1];

    layer.forEach((module, moduleIndex) => {
      if (!nextLayer) {
        // Exercise cycle handling and duplicate edges at the end of the graph.
        importModuleGraph.set(module.uri, [sourceFile, sourceFile]);
        return;
      }

      const adjacentModule = nextLayer[(moduleIndex + 1) % MODULES_PER_LAYER];
      const distantModule =
        nextLayer[(moduleIndex + MODULES_PER_LAYER / 2) % MODULES_PER_LAYER];
      const sameModule = nextLayer[moduleIndex];

      importModuleGraph.set(module.uri, [
        sameModule,
        adjacentModule,
        distantModule,
        sameModule,
      ]);
    });
  });

  return { importModuleGraph, sourceFile };
}

function measure(
  operation: () => IStressModule[],
  iterations: number,
): { elapsed: number; visitedModules: number } {
  const start = performance.now();
  let visitedModules = 0;

  for (let iteration = 0; iteration < iterations; iteration++) {
    visitedModules += operation().length;
  }

  return { elapsed: performance.now() - start, visitedModules };
}

describe("transitive importing module traversal performance", () => {
  it("stress tests the functional traversal", () => {
    const { importModuleGraph, sourceFile } = createStressGraph();
    const functionalTraversal = (): IStressModule[] =>
      getTransitiveImportingModules(importModuleGraph, sourceFile);

    expect(functionalTraversal()).toHaveLength(EXPECTED_MODULES);

    measure(functionalTraversal, WARMUP_ITERATIONS);

    const functional = measure(functionalTraversal, BENCHMARK_ITERATIONS);

    expect(functional.visitedModules).toBe(
      EXPECTED_MODULES * BENCHMARK_ITERATIONS,
    );

    console.info(`Functional: ${functional.elapsed.toFixed(2)}ms`);
    expect(functional.elapsed).toBeLessThan(FUNCTIONAL_TARGET_MS);
  });
});
