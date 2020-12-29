import { URI } from "vscode-uri";
import { SyntaxNode } from "web-tree-sitter";
import { IProgram } from "../program";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import {
  EListPattern,
  EUnionPattern,
  findDefinition,
  mapSyntaxNodeToExpression,
} from "./expressionTree";
import { Utils } from "../../util/utils";

type Match = {
  id: "Match";
  goal: number;
};
const Match = (goal: number): Match => ({ id: "Match", goal });

type Decision = {
  id: "Decision";
  path: Path;
  edges: [Test, DecisionTree][];
  default?: DecisionTree;
};
const Decision = (
  path: Path,
  edges: [Test, DecisionTree][],
  def?: DecisionTree,
): Decision => ({ id: "Decision", path, edges, default: def });

type DecisionTree = Match | Decision;

type IsCtor = {
  id: "IsCtor";
  // home: {
  //   maintainerAndPackageName: string;
  //   moduleName: string;
  // };
  name: string;
  index: number;
  numAlts: number;
  opts: any;
};
const IsCtor = (
  // home: {
  //   maintainerAndPackageName: string;
  //   moduleName: string;
  // },
  name: string,
  index: number,
  numAlts: number,
  opts: any,
): IsCtor => ({ id: "IsCtor", name, index, numAlts, opts });

type IsCons = {
  id: "IsCons";
};
const IsCons: IsCons = { id: "IsCons" };

type IsNil = {
  id: "IsNil";
};
const IsNil: IsNil = { id: "IsNil" };

type IsTuple = {
  id: "IsTuple";
};
const IsTuple: IsTuple = { id: "IsTuple" };

type IsInt = {
  id: "IsInt";
  int: number;
};
const IsInt = (int: number): IsInt => ({ id: "IsInt", int });

type IsChr = {
  id: "IsChr";
  chr: string;
};
const IsChr = (chr: string): IsChr => ({ id: "IsChr", chr });

type IsStr = {
  id: "IsStr";
  str: string;
};
const IsStr = (str: string): IsStr => ({ id: "IsStr", str });

type IsBool = {
  id: "IsBool";
};
const IsBool: IsBool = { id: "IsBool" };

type Test = IsCtor | IsCons | IsNil | IsTuple | IsInt | IsChr | IsStr | IsBool;

function testEquals(a: Test, b: Test): boolean {
  switch (a.id) {
    case "IsCtor":
      return (
        b.id === "IsCtor" &&
        a.name === b.name &&
        a.numAlts === b.numAlts &&
        a.index === b.index
      );

    case "IsCons":
      return b.id === "IsCons";

    case "IsNil":
      return b.id === "IsNil";

    case "IsTuple":
      return b.id === "IsTuple";

    case "IsInt":
      return b.id === "IsInt" && a.int === b.int;

    case "IsChr":
      return b.id === "IsChr" && a.chr === b.chr;

    case "IsStr":
      return b.id === "IsStr" && a.str === b.str;

    case "IsBool":
      return b.id === "IsBool";
  }
}

type Index = {
  id: "Index";
  zeroBasedIndex: number;
  path: Path;
};
const Index = (zeroBasedIndex: number, path: Path): Index => ({
  id: "Index",
  zeroBasedIndex,
  path,
});

type Unbox = {
  id: "Unbox";
  path: Path;
};
const Unbox = (path: Path): Unbox => ({ id: "Unbox", path });

type Empty = {
  id: "Empty";
};
const Empty: Empty = {
  id: "Empty",
};

type Path = Index | Unbox | Empty;

function pathEquals(a: Path, b: Path): boolean {
  switch (a.id) {
    case "Index":
      return (
        b.id === "Index" &&
        pathEquals(a.path, b.path) &&
        a.zeroBasedIndex === b.zeroBasedIndex
      );

    case "Unbox":
      return b.id === "Unbox" && pathEquals(a.path, b.path);

    case "Empty":
      return b.id === "Empty";
  }
}

type Branch = {
  goal: number;
  patterns: [Path, SyntaxNode][];
};
const Branch = (goal: number, patterns: [Path, SyntaxNode][]): Branch => ({
  goal,
  patterns,
});

type NotFound = {
  id: "NotFound";
};
const NotFound: NotFound = { id: "NotFound" };

type Found = {
  id: "Found";
  start: [Path, SyntaxNode][];
  pattern: SyntaxNode;
  end: [Path, SyntaxNode][];
};
const Found = (
  start: [Path, SyntaxNode][],
  pattern: SyntaxNode,
  end: [Path, SyntaxNode][],
): Found => ({
  id: "Found",
  start,
  pattern,
  end,
});

type Extract = NotFound | Found;

export function compileDecisionTree(patterns: SyntaxNode[]): DecisionTree {
  const branches = patterns.map<Branch>((pattern, i) => ({
    goal: i,
    patterns: [[Empty, pattern]],
  }));

  return toDecisionTree(branches);
}

function toDecisionTree(rawBranches: Branch[]): DecisionTree {
  const branches = rawBranches.map(flattenPattern);

  const goal = checkForMatch(branches);
  if (goal !== undefined) {
    return Match(goal);
  } else {
    const path = pickPath(branches);
    const [edges, fallback] = gatherEdges(branches, path);
    const decisionEdges = edges.map(
      (edge) => [edge[0], toDecisionTree(edge[1])] as [Test, DecisionTree],
    );

    if (decisionEdges.length === 1 && fallback.length === 0) {
      return decisionEdges[0][1];
    } else if (fallback.length === 0) {
      return Decision(path, decisionEdges);
    } else if (decisionEdges.length === 0 && fallback.length > 0) {
      return toDecisionTree(fallback);
    } else {
      return Decision(path, decisionEdges, toDecisionTree(fallback));
    }
  }
}

function flattenPattern(branch: Branch): Branch {
  return {
    goal: branch.goal,
    patterns: foldr(flatten, [], branch.patterns),
  };
}

function flatten(
  pathPattern: [Path, SyntaxNode],
  otherPathPatterns: [Path, SyntaxNode][],
): [Path, SyntaxNode][] {
  const path = pathPattern[0];
  const pattern = pathPattern[1];

  if (pattern.type === "pattern") {
    const patternAs = pattern.childForFieldName("patternAs");

    // PAlias
    if (patternAs) {
      return flatten(
        [path, pattern],
        [[path, patternAs], ...otherPathPatterns],
      );
    }
  }

  switch (pattern.type) {
    case "lower_pattern": // PVar
    case "anything_pattern": // PAnthing
    case "record_pattern": // PRecord
    case "list_pattern": // PList
    case "cons_pattern": // PCons
    case "char_constant_expr": // PChr
    case "string_constant_expr": // PStr
    case "number_constant_expr": // PInt
      return [pathPattern, ...otherPathPatterns];

    // PCtor
    case "union_pattern": {
      const unionPattern = mapSyntaxNodeToExpression(pattern) as EUnionPattern;
      const numAlts = findDefinition(
        unionPattern.constructor.firstNamedChild,
        findProgramOfNode(unionPattern.constructor),
      ).expr?.parent?.children.filter((n) => n.type === "union_variant").length;

      if (numAlts === 1) {
        if (unionPattern.argPatterns.length === 1) {
          return flatten(
            [Unbox(path), unionPattern.argPatterns[0]],
            otherPathPatterns,
          );
        } else {
          return foldr(
            flatten,
            otherPathPatterns,
            subPositions(path, unionPattern.argPatterns),
          );
        }
      } else {
        return [pathPattern, ...otherPathPatterns];
      }
    }

    // PTuple
    case "tuple_pattern": {
      const [a, b, c] = pattern.children
        .filter((n) => n.type === "pattern")
        .map((n) => n.childForFieldName("child")!);

      return flatten(
        [Index(0, path), a],
        flatten(
          [Index(1, path), b],
          c
            ? flatten([Index(2, path), c], otherPathPatterns)
            : otherPathPatterns,
        ),
      );
    }

    case "unit_expr": // PUnit
      return otherPathPatterns;

    case "pattern":
      return flatten(
        [path, pattern.childForFieldName("child")!],
        otherPathPatterns,
      );

    default:
      throw new Error("Unexpected pattern type");
  }
}

function subPositions(
  path: Path,
  patterns: SyntaxNode[],
): [Path, SyntaxNode][] {
  return patterns.map((pattern, index) => [Index(index, path), pattern]);
}

function checkForMatch(branches: Branch[]): number | undefined {
  if (
    branches.length > 0 &&
    branches[0].patterns.every(([_, pattern]) => !needsTests(pattern))
  ) {
    return branches[0].goal;
  }
}

function needsTests(pattern: SyntaxNode): boolean {
  switch (pattern.type) {
    case "lower_pattern": // PVar
    case "anything_pattern": // PAnthing
    case "record_pattern": // PRecord
      return false;

    case "union_pattern": // PCtor
    case "list_pattern": // PList
    case "cons_pattern": // PCons
    case "unit_expr": // PUnit
    case "tuple_pattern": // PTuple
    case "char_constant_expr": // PChr
    case "string_constant_expr": // PStr
    case "number_constant_expr": // PInt
      return true;

    default:
      throw new Error("Unexpected pattern type");
  }
}

function pickPath(branches: Branch[]): Path {
  const allPaths = branches
    .flatMap((branch) => branch.patterns)
    .map(isChoicePath)
    .filter((x) => !!x) as Path[];

  const paths = bests(
    addWeights((path) => smallDefaults(branches, path), allPaths),
  );
  if (paths.length === 1) {
    return paths[0];
  } else {
    return bests(
      addWeights((path) => smallBranchingFactor(branches, path), paths),
    )[0];
  }
}

function isChoicePath([path, pattern]: [Path, SyntaxNode]): Path | undefined {
  if (needsTests(pattern)) {
    return path;
  }
}

function bests(allPaths: [Path, number][]): Path[] {
  if (allPaths.length > 0) {
    const [[headPath, headWeight], ...weightedPaths] = allPaths;

    const gatherMinimum = (
      acc: [number, Path[]],
      [path, weight]: [Path, number],
    ): [number, Path[]] => {
      const minWeight = acc[0];
      const paths = acc[1];
      if (weight === minWeight) {
        return [minWeight, [path, ...paths]];
      } else if (weight < minWeight) {
        return [weight, [path]];
      } else {
        return acc;
      }
    };

    return foldl(gatherMinimum, [headWeight, [headPath]], weightedPaths)[1];
  }

  throw new Error("Cannot choose the best of zero paths");
}

function addWeights(
  toWeight: (path: Path) => number,
  paths: Path[],
): [Path, number][] {
  return paths.map((path) => [path, toWeight(path)]);
}

function smallDefaults(branches: Branch[], path: Path): number {
  return branches.filter((branch) => isIrrelevantTo(path, branch)).length;
}

function smallBranchingFactor(branches: Branch[], path: Path): number {
  const [edges, fallback] = gatherEdges(branches, path);
  return edges.length + (fallback.length === 0 ? 0 : 1);
}

function isIrrelevantTo(selectedPath: Path, { patterns }: Branch): boolean {
  const pattern = patterns.find(([path]) => pathEquals(path, selectedPath));

  if (pattern) {
    return !needsTests(pattern[1]);
  }

  return true;
}

function gatherEdges(
  branches: Branch[],
  path: Path,
): [[Test, Branch[]][], Branch[]] {
  const relavantTests = testsAtPath(path, branches);
  const allEdges = relavantTests.map((test) => edgesFor(path, branches, test));
  const fallbacks = isComplete(relavantTests)
    ? []
    : branches.filter((branch) => isIrrelevantTo(path, branch));

  return [allEdges, fallbacks];
}

function testsAtPath(selectedPath: Path, branches: Branch[]): Test[] {
  const allTests = branches
    .map((branch) => testAtPath(selectedPath, branch))
    .filter((x) => !!x) as Test[];

  const skipVisited = (
    test: Test,
    cur: [Test[], DataSet<Test>],
  ): [Test[], DataSet<Test>] => {
    const uniqueTests = cur[0];
    const visitedTests = cur[1];
    if (visitedTests.has(test)) {
      return cur;
    } else {
      return [
        [test, ...uniqueTests],
        new DataSet(testEquals, visitedTests).add(test),
      ];
    }
  };

  return foldr(skipVisited, [[], new DataSet<Test>(testEquals)], allTests)[0];
}

function testAtPath(
  selectedPath: Path,
  { patterns: pathPatterns }: Branch,
): Test | undefined {
  const existing = pathPatterns.find(([path]) =>
    pathEquals(path, selectedPath),
  );
  if (!existing) {
    return;
  }

  const pattern = existing[1];

  switch (pattern.type) {
    // PCtor
    case "union_pattern": {
      // TODO: Abstract all the union stuff
      const unionPattern = mapSyntaxNodeToExpression(pattern) as EUnionPattern;

      const name = unionPattern.constructor.text;
      const program = findProgramOfNode(unionPattern.constructor);
      const definition = findDefinition(
        unionPattern.constructor.firstNamedChild,
        program,
      );

      if (!definition.expr) {
        throw new Error("Cannot get definition of union_pattern");
      }

      const unionVariants =
        definition.expr.parent?.children.filter(
          (n) => n.type === "union_variant",
        ) ?? [];
      const numAlts = unionVariants.length;
      const index = unionVariants.findIndex(
        (unionVariant) => unionVariant.childForFieldName("name")?.text === name,
      );

      const sourceFile = program.getSourceFile(definition.expr.tree.uri);

      if (!sourceFile || !sourceFile.moduleName) {
        throw new Error("Cannot get source file");
      }

      return IsCtor(
        // {
        //   maintainerAndPackageName: sourceFile.maintainerAndPackageName,
        //   moduleName: sourceFile.moduleName,
        // },
        name,
        index,
        numAlts,
        {},
      );
    }

    case "list_pattern": // PList
      return pattern.children.filter((n) => n.type === "pattern").length === 0
        ? IsNil
        : IsCons;

    case "cons_pattern": // PCons
      return IsCons;

    case "tuple_pattern": // PTuple
    case "unit_expr": // PUnit
      return IsTuple;

    case "lower_pattern": // PVar
    case "anything_pattern": // PAnything
    case "record_pattern": // PRecord
      return;

    case "char_constant_expr": // PChr
      return IsChr(pattern.text);

    case "string_constant_expr": // PStr
      return IsStr(pattern.text);

    case "number_constant_expr": // PInt
      return IsInt(parseInt(pattern.text));

    default:
      throw new Error("Unexpected pattern type");
  }
}

function edgesFor(
  path: Path,
  branches: Branch[],
  test: Test,
): [Test, Branch[]] {
  return [
    test,
    branches
      .map((branch) => toRelavantBranch(test, path, branch))
      .filter((x) => !!x) as Branch[],
  ];
}

function toRelavantBranch(
  test: Test,
  path: Path,
  branch: Branch,
): Branch | undefined {
  const extracted = extract(path, branch.patterns);

  if (extracted.id === "Found") {
    switch (extracted.pattern.type) {
      // PCtor
      case "union_pattern": {
        const unionPattern = mapSyntaxNodeToExpression(
          extracted.pattern,
        ) as EUnionPattern;
        const name = unionPattern.constructor.text;
        const numAlts = findDefinition(
          unionPattern.constructor.firstNamedChild,
          findProgramOfNode(unionPattern.constructor),
        ).expr?.parent?.children.filter((n) => n.type === "union_variant")
          .length;

        if (test.id === "IsCtor" && name === test.name) {
          return {
            goal: branch.goal,
            patterns:
              unionPattern.argPatterns.length === 1 && numAlts === 1
                ? [
                    ...extracted.start,
                    [Unbox(path), unionPattern.argPatterns[0]],
                    ...extracted.end,
                  ]
                : [
                    ...extracted.start,
                    ...subPositions(path, unionPattern.argPatterns),
                    ...extracted.end,
                  ],
          };
        }

        break;
      }

      case "char_constant_expr": // PChr
        if (test.id === "IsChr" && extracted.pattern.text === test.chr) {
          return Branch(branch.goal, [...extracted.start, ...extracted.end]);
        }
        break;

      case "string_constant_expr": // PStr
        if (test.id === "IsStr" && extracted.pattern.text === test.str) {
          return Branch(branch.goal, [...extracted.start, ...extracted.end]);
        }
        break;

      case "tuple_pattern": {
        const childPatterns = extracted.pattern.children.filter(
          (n) => n.type === "pattern",
        );

        return Branch(branch.goal, [
          ...extracted.start,
          ...subPositions(path, childPatterns),
          ...extracted.end,
        ]);
      }

      case "anything_pattern": // PAnything
      case "lower_pattern": // PVar
      case "record_pattern": // PRecord
        return branch;

      case "cons_pattern": {
        if (test.id === "IsCons") {
          const head = extracted.pattern.firstNamedChild;
          const tail = extracted.pattern.lastNamedChild; // This does not deal with multiple cons

          if (extracted.pattern.namedChildren.length > 2) {
            console.log("ERROR - unfinished code");
          }

          if (head && tail) {
            return Branch(branch.goal, [
              ...extracted.start,
              ...subPositions(path, [head, tail]),
              ...extracted.end,
            ]);
          }
        }
        break;
      }

      case "list_pattern": {
        const listPattern = mapSyntaxNodeToExpression(
          extracted.pattern,
        ) as EListPattern;
        if (listPattern.parts.length === 0) {
          if (test.id === "IsNil") {
            return Branch(branch.goal, [...extracted.start, ...extracted.end]);
          }
        } else {
          if (test.id === "IsCons") {
            const [head, ...tail] = listPattern.parts;
            console.log("ERROR - unfinished code");
            return Branch(branch.goal, [
              ...extracted.start,
              ...subPositions(path, [head, ...tail]), // Not correct
              ...extracted.end,
            ]);
          }
        }
      }
    }
  } else {
    return branch;
  }
}

function extract(
  selectedPath: Path,
  pathPatterns: [Path, SyntaxNode][],
): Extract {
  if (pathPatterns.length === 0) {
    return NotFound;
  } else {
    const [first, ...rest] = pathPatterns;
    const path = first[0];
    const pattern = first[1];

    if (pathEquals(path, selectedPath)) {
      return Found([], pattern, rest);
    } else {
      const result = extract(selectedPath, rest);
      if (result.id === "NotFound") {
        return NotFound;
      } else {
        return Found([first, ...result.start], result.pattern, result.end);
      }
    }
  }
}

function isComplete(tests: Test[]): boolean {
  const head = tests[0];
  switch (head.id) {
    case "IsCtor":
      return head.numAlts === tests.length;

    case "IsCons":
    case "IsNil":
    case "IsBool":
      return tests.length === 2;

    case "IsTuple":
      return true;

    case "IsChr":
    case "IsStr":
    case "IsInt":
      return false;
  }
}

// Decider

type Leaf<T> = {
  id: "Leaf";
  target: T;
};
const Leaf = <T>(target: T): Leaf<T> => ({ id: "Leaf", target });

type Chain<T> = {
  id: "Chain";
  testChain: [Path, Test][];
  success: Decider<T>;
  failure: Decider<T>;
};
const Chain = <T>(
  testChain: [Path, Test][],
  success: Decider<T>,
  failure: Decider<T>,
): Chain<T> => ({ id: "Chain", testChain, success, failure });

type FanOut<T> = {
  id: "FanOut";
  path: Path;
  tests: [Test, Decider<T>][];
  fallback: Decider<T>;
};
const FanOut = <T>(
  path: Path,
  tests: [Test, Decider<T>][],
  fallback: Decider<T>,
): FanOut<T> => ({ id: "FanOut", path, tests, fallback });

export type Decider<T> = Leaf<T> | Chain<T> | FanOut<T>;

function deciderEquals<T>(a: Decider<T>, b: Decider<T>): boolean {
  switch (a.id) {
    case "Leaf":
      return b.id === "Leaf" && a.target === b.target;

    case "Chain":
      return (
        b.id === "Chain" &&
        Utils.arrayEquals(
          a.testChain,
          b.testChain,
          ([aPath, aTest], [bPath, bTest]) =>
            pathEquals(aPath, bPath) && testEquals(aTest, bTest),
        ) &&
        deciderEquals(a.success, b.success) &&
        deciderEquals(a.failure, b.failure)
      );

    case "FanOut":
      return (
        b.id === "FanOut" &&
        pathEquals(a.path, b.path) &&
        Utils.arrayEquals(
          a.tests,
          b.tests,
          ([aTest, aDecider], [bTest, bDecider]) =>
            testEquals(aTest, bTest) && deciderEquals(aDecider, bDecider),
        ) &&
        deciderEquals(a.fallback, b.fallback)
      );
  }
}

type Inline = {
  id: "Inline";
  expr: SyntaxNode;
};
const Inline = (expr: SyntaxNode): Inline => ({ id: "Inline", expr });

type Jump = {
  id: "Jump";
  target: number;
};
const Jump = (target: number): Jump => ({ id: "Jump", target });

export type Choice = Inline | Jump;

export function treeToDecider(tree: DecisionTree): Decider<number> {
  switch (tree.id) {
    case "Match":
      return Leaf(tree.goal);

    case "Decision": {
      if (tree.edges.length === 0 && !tree.default) {
        throw new Error("Should never happen, empty decision tree");
      } else if (tree.edges.length === 1 && !tree.default) {
        return treeToDecider(tree.edges[0][1]);
      } else if (tree.edges.length === 0 && tree.default) {
        return treeToDecider(tree.default);
      } else if (tree.edges.length === 1 && tree.default) {
        return toChain(
          tree.path,
          tree.edges[0][0],
          tree.edges[0][1],
          tree.default,
        );
      } else if (tree.edges.length === 2 && !tree.default) {
        return toChain(
          tree.path,
          tree.edges[0][0],
          tree.edges[0][1],
          tree.edges[1][1],
        );
      } else if (!tree.default) {
        const [necessaryTests, fallback] = [
          tree.edges.slice(0, tree.edges.length - 1),
          tree.edges[tree.edges.length - 1][1],
        ];

        return FanOut(
          tree.path,
          necessaryTests.map(([path, dt]) => [path, treeToDecider(dt)]),
          treeToDecider(fallback),
        );
      } else {
        return FanOut(
          tree.path,
          tree.edges.map(([path, dt]) => [path, treeToDecider(dt)]),
          treeToDecider(tree.default),
        );
      }
    }
  }
}

function toChain(
  path: Path,
  test: Test,
  successTree: DecisionTree,
  failureTree: DecisionTree,
): Decider<number> {
  const failure = treeToDecider(failureTree);
  const success = treeToDecider(successTree);

  if (success.id === "Chain" && deciderEquals(failure, success.failure)) {
    return Chain(
      [[path, test], ...success.testChain],
      success.success,
      failure,
    );
  } else {
    return Chain([[path, test]], success, failure);
  }
}

export function countTargets(
  decisionTree: Decider<number>,
): Map<number, number> {
  switch (decisionTree.id) {
    case "Leaf":
      return new Map([[decisionTree.target, 1]]);

    case "Chain":
      return unionMaps(
        countTargets(decisionTree.success),
        countTargets(decisionTree.failure),
        (a, b) => a + b,
      );

    case "FanOut":
      return unionMapsArray(
        [decisionTree.fallback, ...decisionTree.tests.map(([_, d]) => d)].map(
          countTargets,
        ),
        (a, b) => a + b,
      );
  }
}

export function createChoices(
  targetCounts: Map<number, number>,
  [target, branch]: [number, SyntaxNode],
): [[number, Choice], [number, SyntaxNode] | undefined] {
  if (targetCounts.get(target) === 1) {
    return [[target, Inline(branch)], undefined];
  } else {
    return [
      [target, Jump(target)],
      [target, branch],
    ];
  }
}

export function insertChoices(
  choiceMap: Map<number, Choice>,
  decider: Decider<number>,
): Decider<Choice> {
  const go = (d: Decider<number>): Decider<Choice> =>
    insertChoices(choiceMap, d);

  switch (decider.id) {
    case "Leaf":
      return Leaf(choiceMap.get(decider.target)!);

    case "Chain":
      return Chain(decider.testChain, go(decider.success), go(decider.failure));

    case "FanOut":
      return FanOut(
        decider.path,
        decider.tests.map(([t, d]) => [t, go(d)]),
        go(decider.fallback),
      );
  }
}

// Helpers

export function unzip<A, B>(array: [A, B][]): [A[], B[]] {
  const aList: A[] = [];
  const bList: B[] = [];

  array.forEach(([a, b]) => {
    aList.push(a);
    bList.push(b);
  });

  return [aList, bList];
}

function unionMaps<A, B>(
  a: Map<A, B>,
  b: Map<A, B>,
  combineFunc: (a: B, b: B) => B,
): Map<A, B> {
  const map = new Map<A, B>();

  a.forEach((val, key) => {
    map.set(key, val);
  });

  b.forEach((val, key) => {
    const existing = map.get(key);
    if (existing) {
      map.set(key, combineFunc(existing, val));
    } else {
      map.set(key, val);
    }
  });

  return map;
}

function unionMapsArray<A, B>(
  maps: Map<A, B>[],
  combineFunc: (a: B, b: B) => B,
): Map<A, B> {
  return maps.reduce(
    (prev, cur) => unionMaps(prev, cur, combineFunc),
    new Map<A, B>(),
  );
}

function foldl<A, B>(func: (b: B, a: A) => B, start: B, array: A[]): B {
  return array.reduce(func, start);
}

function foldr<A, B>(func: (a: A, b: B) => B, start: B, array: A[]): B {
  return array.reduceRight((prev, cur) => func(cur, prev), start);
}

export function findProgramOfNode(node: SyntaxNode): IProgram {
  return new ElmWorkspaceMatcher((uri: string) => URI.parse(uri)).getProgramFor(
    node.tree.uri,
  );
}

class DataSet<T> extends Set<T> {
  constructor(
    private eqFunc: (a: T, b: T) => boolean,
    values?: readonly T[] | DataSet<T>,
  ) {
    super(values);
  }

  public delete(value: T): boolean {
    const existing = Array.from(this.values()).find((v) =>
      this.eqFunc(v, value),
    );

    if (existing) {
      return super.delete(existing);
    }

    return false;
  }

  public has(value: T): boolean {
    return !!this.findExisting(value);
  }

  public add(value: T): this {
    if (!this.findExisting(value)) {
      super.add(value);
    }

    return this;
  }

  private findExisting(value: T): T | undefined {
    if (!this.eqFunc) {
      return;
    }
    return Array.from(this.values()).find((v) => this.eqFunc(v, value));
  }
}
