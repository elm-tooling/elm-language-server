import { watch } from "chokidar";
import { readFileSync, writeFileSync } from "fs";
import { container } from "tsyringe";
import { Parser, SyntaxNode } from "web-tree-sitter";
import { IProgram } from "./program";
import * as path from "path";
import { SourceMapGenerator } from "source-map";
import { URI } from "vscode-uri";
import { normalizeSlashes } from "../util/path";
import { debounce } from "ts-debounce";
import {
  Binary,
  BinaryExprTree,
  IOperatorPrecedence,
  Operand,
} from "./operatorPrecedence";
import {
  EBinOpExpr,
  EUnionPattern,
  Expression,
  findDefinition,
  mapSyntaxNodeToExpression,
} from "./utils/expressionTree";
import { SyntaxNodeMap } from "./utils/syntaxNodeMap";
import {
  Choice,
  compileDecisionTree,
  countTargets,
  createChoices,
  Decider,
  findProgramOfNode,
  insertChoices,
  treeToDecider,
  unzip,
} from "./utils/decisionTree";
import { TreeUtils } from "../util/treeUtils";

const customPropertiesGenerators = `
function customDescriptionGenerator(obj, defaultValue){
  if(obj.$){
    return Object.values(obj).map(o => {
      const c = customPropertiesGenerator(o)

      if(typeof c === "string"){
        if(c.includes(' ')){
          return '"' + c + '"'
        }
        return c;
      } else if(typeof c === "number"){
        return c.toString()
      } else if(Array.isArray(c)){
        return "[...]"
      } else if(c.$){
        const d = customDescriptionGenerator(c);
        if(d.includes(' ')){
          return "(" + d + ")"
        }
        return d;
      } else {
        return "{...}"
      }
    
    }).join(' ');
  }
  
  return defaultValue;
}
function customPropertiesGenerator(obj){ 
  if(obj.$){
    if(obj.$ === "::"){
      obj = _List_toArray(obj);
    }
  }

  if(typeof obj === "object"){
    Object.entries(obj).forEach(([name, child]) => {
      if(child){
        obj[name] = customPropertiesGenerator(child);
      }
    })
  }
  
  return obj;
}

window.customDescriptionGenerator = customDescriptionGenerator;
window.customPropertiesGenerator = customPropertiesGenerator;
`;

export interface ISourceMapHost {
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
}

export class SourceMapWatcher {
  constructor(private program: IProgram) {}

  public watchJsOutput(jsOutputPath: string): void {
    const generateSourceMapDebounced = debounce(
      this.generateSourceMap.bind(this),
      500,
    );

    void generateSourceMapDebounced(jsOutputPath);
    watch(jsOutputPath).on("change", () => {
      void generateSourceMapDebounced(jsOutputPath);
    });
  }

  public generateSourceMap(
    jsOutputPath: string,
    sourceMapHost?: ISourceMapHost,
    writeFileDelay = 500,
  ): void {
    const host = sourceMapHost ?? this.nodeSourceMapHost();

    const jsParser = container.resolve<Parser>("JsParser");
    const jsFile = host.readFile(jsOutputPath);

    if (jsFile.includes("sourceMappingURL")) {
      return;
    }

    const jsTree = jsParser.parse(jsFile);
    const sourceMap = new SourceMapGenerator({
      file: path.basename(jsOutputPath),
    });

    const rootNode =
      jsTree.rootNode.firstNamedChild?.firstNamedChild?.firstNamedChild
        ?.childForFieldName("function")
        ?.childForFieldName("body");

    const jsVarMap = new Map<string, SyntaxNode>();

    rootNode?.children.forEach((node) => {
      if (node.type === "variable_declaration") {
        const varDeclarator = node.firstNamedChild;

        const name = varDeclarator?.childForFieldName("name");
        const value = varDeclarator?.childForFieldName("value");

        if (name && value) {
          jsVarMap.set(name.text, value);
        }
      }
    });

    this.program.getForest().treeMap.forEach((sourceFile) => {
      if (!sourceFile.writeable || !sourceFile.moduleName) {
        return;
      }

      const maintainerPackageAndModule =
        "$" +
        [
          ...(sourceFile.maintainerAndPackageName ?? "author/project").split(
            "/",
          ),
          ...sourceFile.moduleName.split("."),
        ].join("$") +
        "$";

      const relativeSource = normalizeSlashes(
        path.relative(
          path.dirname(path.resolve(jsOutputPath)),
          URI.parse(sourceFile.uri).fsPath,
        ),
      );

      sourceMap.setSourceContent(relativeSource, sourceFile.tree.rootNode.text);

      function addMapping(elmNode: SyntaxNode, jsNode: SyntaxNode): void {
        if (jsNode.type === "statement_block") {
          jsNode = jsNode.firstNamedChild ?? jsNode;
        }

        sourceMap.addMapping({
          source: relativeSource,
          original: {
            column: elmNode.startPosition.column,
            line: elmNode.startPosition.row + 1,
          },
          generated: {
            column: jsNode.startPosition.column,
            line: jsNode.startPosition.row + 1,
          },
        });
      }

      function mapExpr(elmNode: SyntaxNode, jsNode: SyntaxNode): void {
        switch (elmNode.type) {
          case "value_declaration":
            mapValueDeclaration(elmNode, jsNode);
            break;
          case "case_of_expr":
            mapCaseExpr(elmNode, jsNode);
            break;
          case "let_in_expr":
            mapLetInExpr(elmNode, jsNode);
            break;
          case "if_else_expr":
            mapIfElseExpr(elmNode, jsNode);
            break;
          case "bin_op_expr":
            mapBinOpExpr(elmNode, jsNode);
            break;
          case "anonymous_function_expr":
            mapAnonymousFunctionExpr(elmNode, jsNode);
            break;
          case "function_call_expr":
            mapFunctionCallExpr(elmNode, jsNode);
            break;
          case "parenthesized_expr":
            {
              const elmExpr = elmNode.childForFieldName("expression");
              if (elmExpr) {
                mapExpr(elmExpr, jsNode);
              }
            }
            break;
        }
      }

      function mapValueDeclaration(
        elmNode: SyntaxNode,
        jsNode: SyntaxNode,
      ): void {
        const elmFuncBody = elmNode?.childForFieldName("body");

        if (jsNode.type === "variable_declaration") {
          jsNode = jsNode.firstNamedChild?.childForFieldName("value") ?? jsNode;
        }

        if (!elmFuncBody) {
          return;
        }

        // F wrapper
        if (
          jsNode?.type === "call_expression" &&
          jsNode.childForFieldName("function")?.text.match("F[2-9]")
        ) {
          jsNode =
            jsNode.childForFieldName("arguments")?.firstNamedChild ??
            jsNode.childForFieldName("function") ??
            jsNode;
        }

        if (jsNode?.type === "function") {
          const destructors =
            elmNode.firstNamedChild?.namedChildren
              .slice(1)
              .filter((n) => n.type !== "lower_pattern")
              .flatMap((c) => destruct(c, Root(""))) ?? [];

          const jsFuncBody = jsNode?.childForFieldName("body");

          const jsFuncBodyTarget =
            destructors.length === 0
              ? jsFuncBody?.firstNamedChild
              : jsFuncBody?.namedChildren.find(
                  (n) =>
                    n.type === "variable_declaration" &&
                    n.firstNamedChild?.childForFieldName("name")?.text ===
                      destructors[destructors.length - 1].name,
                )?.nextNamedSibling;

          if (jsFuncBody && jsFuncBodyTarget) {
            addMapping(elmFuncBody, jsFuncBodyTarget);
            mapExpr(
              elmFuncBody,
              elmFuncBody.type === "let_in_expr" ||
                elmFuncBody.type === "case_of_expr"
                ? jsFuncBody
                : jsFuncBodyTarget,
            );
          }
        } else {
          addMapping(elmFuncBody, jsNode);
          mapExpr(elmFuncBody, jsNode);
        }
      }

      function mapCaseExpr(elmNode: SyntaxNode, jsNode: SyntaxNode): void {
        const caseOfBranches = elmNode.children.filter(
          (n) => n.type === "case_of_branch",
        );

        const caseOfPatterns = caseOfBranches.map(
          (n) => n.childForFieldName("pattern")!,
        );

        const dt = compileDecisionTree(caseOfPatterns);
        const decider = treeToDecider(dt);
        const targetCounts = countTargets(decider);
        const [choices, maybeJumps] = unzip(
          caseOfBranches.map((branch, i) =>
            createChoices(targetCounts, [i, branch]),
          ),
        );

        const caseChoices = insertChoices(new Map(choices), decider);
        const caseJumps = maybeJumps.filter((x) => !!x) as [
          number,
          SyntaxNode,
        ][];

        {
          const mapDecider = (
            decisionTree: Decider<Choice>,
            jsNode: SyntaxNode,
          ): void => {
            switch (decisionTree.id) {
              case "Leaf":
                if (decisionTree.target.id === "Inline") {
                  const elmBranch =
                    decisionTree.target.expr.childForFieldName("expr");

                  const elmPattern =
                    decisionTree.target.expr.childForFieldName("pattern");

                  // Pick correct child to map
                  const destructors = elmPattern
                    ? destruct(elmPattern, Root(""))
                    : [];

                  // For switch_case, the first child is the case value
                  const jsTargetNode =
                    jsNode.namedChildren[
                      destructors.length +
                        (jsNode.type === "switch_case" ? 1 : 0)
                    ] ?? jsNode.lastNamedChild;

                  if (elmBranch) {
                    addMapping(elmBranch, jsTargetNode);
                    mapExpr(
                      elmBranch,
                      elmBranch.type === "case_of_expr" ||
                        elmBranch.type === "let_in_expr"
                        ? jsNode
                        : jsTargetNode,
                    );
                  }
                } else {
                  // Break
                }
                break;

              case "Chain":
                {
                  if (jsNode.type !== "if_statement") {
                    jsNode =
                      TreeUtils.findFirstNamedChildOfType(
                        "if_statement",
                        jsNode,
                      ) ?? jsNode;
                  }

                  // If statement
                  const jsIfBranch = jsNode.childForFieldName("consequence");
                  let jsElseBranch = jsNode.childForFieldName("alternative");

                  if (jsElseBranch?.type === "else_clause") {
                    jsElseBranch = jsElseBranch.firstNamedChild;
                  }

                  if (jsIfBranch && jsElseBranch) {
                    mapDecider(decisionTree.success, jsIfBranch);
                    mapDecider(decisionTree.failure, jsElseBranch);
                  }
                }
                break;

              case "FanOut":
                {
                  if (jsNode.type !== "switch_statement") {
                    jsNode =
                      TreeUtils.findFirstNamedChildOfType(
                        "switch_statement",
                        jsNode,
                      ) ?? jsNode;
                  }

                  // Switch statement
                  const jsSwitchCases =
                    jsNode
                      .childForFieldName("body")
                      ?.children.filter((n) => n.type === "switch_case") ?? [];

                  const jsSwitchDefault = (jsNode
                    .childForFieldName("body")
                    ?.children.filter((n) => n.type === "switch_default") ??
                    [])[0];

                  decisionTree.tests.forEach(([_, subTree], i) => {
                    mapDecider(subTree, jsSwitchCases[i]);
                  });

                  if (jsSwitchDefault) {
                    mapDecider(decisionTree.fallback, jsSwitchDefault);
                  }
                }
                break;
            }
          };

          caseJumps.forEach(([_, branch]) => {
            const labeled =
              jsNode.type === "labeled_statement"
                ? jsNode
                : TreeUtils.findFirstNamedChildOfType(
                    "labeled_statement",
                    jsNode,
                  );

            const jsBranch = labeled?.parent?.lastNamedChild;
            const elmBranch = branch.childForFieldName("expr");

            if (elmBranch && jsBranch) {
              addMapping(elmBranch, jsBranch);
            }

            jsNode =
              labeled?.lastNamedChild?.childForFieldName("body")
                ?.firstNamedChild ?? jsNode;
          });
          mapDecider(caseChoices, jsNode);
        }
      }

      function mapLetInExpr(elmNode: SyntaxNode, jsNode: SyntaxNode): void {
        elmNode.children
          .filter((n) => n.type === "value_declaration")
          .forEach((valueDeclaration) => {
            const isFuncNode = (n: SyntaxNode): boolean =>
              n.type === "variable_declaration" &&
              n.firstNamedChild?.childForFieldName("name")?.text ===
                valueDeclaration.firstNamedChild?.firstNamedChild?.text;

            const jsFuncNode = isFuncNode(jsNode)
              ? jsNode
              : jsNode.children.find(isFuncNode);

            if (jsFuncNode) {
              mapValueDeclaration(valueDeclaration, jsFuncNode);
            }
          });

        const body = elmNode.childForFieldName("body");
        const jsReturn = jsNode.lastNamedChild;

        if (body && jsReturn) {
          addMapping(body, adjustTargetForCaseOrIfExpr(jsReturn));
          mapExpr(body, jsReturn);
        }
      }

      function mapIfElseExpr(elmNode: SyntaxNode, jsNode: SyntaxNode): void {
        if (
          jsNode.type !== "ternary_expression" &&
          jsNode.type !== "if_statement"
        ) {
          jsNode =
            TreeUtils.findFirstNamedChildOfType("ternary_expression", jsNode) ??
            TreeUtils.findFirstNamedChildOfType("if_statement", jsNode) ??
            TreeUtils.findFirstNamedChildOfType("return_statement", jsNode) ??
            jsNode;
        }

        if (jsNode.type === "return_statement") {
          jsNode = jsNode.firstNamedChild ?? jsNode;
        }

        if (
          jsNode.type === "ternary_expression" ||
          jsNode.type === "if_statement"
        ) {
          const jsNodes: SyntaxNode[] = [];
          let jsIfNode = jsNode.childForFieldName("consequence");
          let jsElseNode = jsNode.childForFieldName("alternative");

          if (jsIfNode && jsElseNode) {
            jsNodes.push(jsIfNode, jsElseNode);

            let lastElseNode = jsNodes[jsNodes.length - 1].firstNamedChild;
            while (
              lastElseNode?.type === "ternary_expression" ||
              lastElseNode?.type === "if_statement"
            ) {
              jsNodes[jsNodes.length - 1] =
                lastElseNode.firstNamedChild ?? lastElseNode;

              jsIfNode = lastElseNode.childForFieldName("consequence");
              jsElseNode = lastElseNode.childForFieldName("alternative");

              if (jsIfNode && jsElseNode) {
                jsNodes.push(jsIfNode, jsElseNode);
                lastElseNode = jsNodes[jsNodes.length - 1].firstNamedChild;
              }
            }

            const elmNodes = elmNode.namedChildren.slice(1);

            if (elmNodes.length === jsNodes.length) {
              elmNodes.forEach((elmNode, i) => {
                addMapping(elmNode, jsNodes[i]);
                mapExpr(elmNode, jsNodes[i]);
              });
            }
          }
        }
      }

      function mapBinOpExpr(elmNode: SyntaxNode, jsNode: SyntaxNode): void {
        const binOpExpr = mapSyntaxNodeToExpression(elmNode) as EBinOpExpr;

        const operatorPrecedences = new SyntaxNodeMap<
          Expression,
          IOperatorPrecedence
        >();

        // TODO: Share parts of this with type inference
        for (const part of binOpExpr.parts) {
          if (part.nodeType === "Operator") {
            operatorPrecedences.set(part, getOperatorPrecedence(part));
          }
        }

        if (jsNode.lastNamedChild?.type === "return_statement") {
          jsNode = jsNode.lastNamedChild ?? jsNode;
        }

        if (jsNode.type === "return_statement") {
          jsNode = jsNode.firstNamedChild ?? jsNode;
        }

        handleTree(
          BinaryExprTree.parse(binOpExpr.parts, operatorPrecedences),
          jsNode,
        );

        function handleTree(tree: BinaryExprTree, jsNode: SyntaxNode): void {
          switch (tree.type) {
            case "Binary":
              {
                const binaryTree = <Binary>tree;

                switch (binaryTree.operator.text) {
                  case "|>":
                    if (binaryTree.right.type === "Operand") {
                      const rightOperand = <Operand>binaryTree.right;
                      if (rightOperand.operand.type === "function_call_expr") {
                        if (jsNode.type === "call_expression") {
                          const jsArgs =
                            jsNode.childForFieldName("arguments")
                              ?.namedChildren ?? [];

                          rightOperand.operand.namedChildren.forEach(
                            (elmArg, i) => {
                              addMapping(elmArg, jsArgs[i]);
                              mapExpr(elmArg, jsArgs[i]);
                            },
                          );

                          handleTree(
                            binaryTree.left,
                            jsArgs[jsArgs.length - 1],
                          );
                        }
                      } else if (
                        rightOperand.operand.type === "anonymous_function_expr"
                      ) {
                        if (jsNode.type === "call_expression") {
                          const jsFunc = jsNode.childForFieldName("function");
                          const jsArgs =
                            jsNode.childForFieldName(
                              "arguments",
                            )?.firstNamedChild;

                          if (jsFunc && jsArgs) {
                            mapExpr(rightOperand.operand, jsFunc);
                            handleTree(binaryTree.left, jsArgs);
                          }
                        }
                      } else if (
                        rightOperand.operand.type ===
                        "field_accessor_function_expr"
                      ) {
                        if (jsNode.type === "member_expression") {
                          const jsMember = jsNode.childForFieldName("property");
                          const jsTarget = jsNode.childForFieldName("object");

                          if (jsMember && jsTarget) {
                            mapExpr(rightOperand.operand, jsMember);
                            handleTree(binaryTree.left, jsTarget);
                          }
                        }
                      }
                    }
                    break;

                  case "<|":
                    if (binaryTree.left.type === "Operand") {
                      const leftOperand = <Operand>binaryTree.left;
                      if (leftOperand.operand.type === "function_call_expr") {
                        if (jsNode.type === "return_statement") {
                          jsNode = jsNode.firstNamedChild ?? jsNode;
                        }

                        if (jsNode.type === "call_expression") {
                          const jsArgs =
                            jsNode.childForFieldName("arguments")
                              ?.namedChildren ?? [];

                          leftOperand.operand.namedChildren.forEach(
                            (elmArg, i) => {
                              addMapping(elmArg, jsArgs[i]);
                            },
                          );

                          handleTree(
                            binaryTree.right,
                            jsArgs[jsArgs.length - 1],
                          );
                        }
                      }
                    }
                    break;

                  default:
                    if (jsNode.type === "parenthesized_expression") {
                      jsNode = jsNode.firstNamedChild ?? jsNode;
                    }

                    if (jsNode.type === "binary_expression") {
                      // const jsLeft = jsNode.childForFieldName("left");
                      // const jsRight = jsNode.childForFieldName("right");
                      // if (jsLeft && jsRight) {
                      //   handleTree(binaryTree.left, jsLeft);
                      //   handleTree(binaryTree.right, jsRight);
                      // }
                    }
                    break;
                }
              }
              break;

            case "Operand":
              {
                const operandTree = <Operand>tree;

                if (operandTree.operand.type === "function_call_expr") {
                  if (jsNode.type === "call_expression") {
                    const jsArgs =
                      jsNode.childForFieldName("arguments")?.namedChildren ??
                      [];

                    if (
                      operandTree.operand.namedChildren.length === jsArgs.length
                    ) {
                      operandTree.operand.namedChildren.forEach((elmArg, i) => {
                        addMapping(elmArg, jsArgs[i]);
                      });
                    }
                  }
                } else {
                  if (jsNode.type === "call_expression") {
                    jsNode =
                      jsNode
                        .childForFieldName("function")
                        ?.childForFieldName("body")?.firstNamedChild ??
                      jsNode.childForFieldName("arguments")?.firstNamedChild ??
                      jsNode;

                    addMapping(operandTree.operand, jsNode);
                    mapExpr(operandTree.operand, jsNode);
                  }
                }
              }
              break;
          }
        }
      }

      function mapAnonymousFunctionExpr(
        elmNode: SyntaxNode,
        jsNode: SyntaxNode,
      ): void {
        if (
          jsNode?.type === "call_expression" &&
          jsNode.childForFieldName("function")?.text.match("F[2-9]")
        ) {
          jsNode =
            jsNode.childForFieldName("arguments")?.firstNamedChild ??
            jsNode.childForFieldName("function") ??
            jsNode;
        }

        const elmExprBody = elmNode.childForFieldName("expr");
        const jsExprBody = jsNode.childForFieldName("body");
        const jsExprTarget = jsExprBody?.firstNamedChild;

        if (elmExprBody && jsExprBody && jsExprTarget) {
          addMapping(elmExprBody, jsExprTarget);
          mapExpr(
            elmExprBody,
            elmExprBody.type === "let_in_expr" ? jsExprBody : jsExprTarget,
          );
        }
      }

      function mapFunctionCallExpr(
        elmNode: SyntaxNode,
        jsNode: SyntaxNode,
      ): void {
        if (jsNode.type === "statement_block") {
          jsNode = jsNode.firstNamedChild ?? jsNode;
        }

        if (jsNode.lastNamedChild?.type === "return_statement") {
          jsNode = jsNode.lastNamedChild ?? jsNode;
        }

        if (jsNode.type === "return_statement") {
          jsNode = jsNode.firstNamedChild ?? jsNode;
        }

        // A function wrapper
        if (jsNode.type === "call_expression") {
          const elmArgs = elmNode.namedChildren.slice(1);
          let jsArgs =
            jsNode.childForFieldName("arguments")?.namedChildren ?? [];

          if (jsNode.childForFieldName("function")?.text.match("A[2-9]")) {
            // The first is the function name
            jsArgs = jsArgs.slice(1);
          }

          if (elmArgs.length === jsArgs.length) {
            elmArgs.forEach((elmArg, i) => {
              mapExpr(elmArg, jsArgs[i]);
            });
          }
        }
      }

      function adjustTargetForCaseOrIfExpr(jsNode: SyntaxNode): SyntaxNode {
        if (
          jsNode.type === "if_statement" ||
          jsNode.type === "switch_statement"
        ) {
          const jsExpr = (
            jsNode.childForFieldName("condition") ??
            jsNode.childForFieldName("value")
          )?.firstNamedChild;

          if (
            jsExpr?.text.includes("_v") &&
            jsNode.previousNamedSibling?.type === "variable_declaration" &&
            jsNode.previousNamedSibling.firstNamedChild
              ?.childForFieldName("name")
              ?.text.includes("_v")
          ) {
            return jsNode.previousNamedSibling;
          }
        }

        return jsNode;
      }

      sourceFile.symbolLinks
        ?.get(sourceFile.tree.rootNode)
        ?.forEach(({ node, type }, name) => {
          if (type === "Function") {
            const elmValueDeclaration = node.parent;
            const jsNode = jsVarMap.get(maintainerPackageAndModule + name);

            if (elmValueDeclaration && jsNode) {
              mapValueDeclaration(elmValueDeclaration, jsNode);
            }
          }
        });
    });

    const splitIndex = jsFile.lastIndexOf("}(this));");

    // Write the source map to disk
    const sourceMapPath = this.getSourceMapPath(jsOutputPath);
    host.writeFile(sourceMapPath, sourceMap.toString());

    // Add the source mapping url to the end of the js file
    const sourceMapUrl = `//# sourceMappingURL=${path.basename(sourceMapPath)}`;

    const newJsFile =
      jsFile.slice(0, splitIndex) +
      `\n${customPropertiesGenerators}\n` +
      jsFile.slice(splitIndex) +
      `\n${sourceMapUrl}`;

    if (writeFileDelay === 0) {
      host.writeFile(jsOutputPath, newJsFile);
    } else {
      setTimeout(() => {
        host.writeFile(jsOutputPath, newJsFile);
      }, writeFileDelay);
    }
  }

  private getSourceMapPath(jsOutputPath: string): string {
    const sourceMapName =
      path.basename(path.resolve(jsOutputPath), ".js") + ".js.map";
    return path.join(path.dirname(jsOutputPath), sourceMapName);
  }

  private nodeSourceMapHost(): ISourceMapHost {
    return {
      readFile: (path): string => readFileSync(path, { encoding: "utf-8" }),
      writeFile: (path, content): void => writeFileSync(path, content),
    };
  }
}

function getOperatorPrecedence(operator: SyntaxNode): IOperatorPrecedence {
  switch (operator.text) {
    case "<|":
      return { associativity: "RIGHT", precedence: 0 };
    case "|>":
      return { associativity: "LEFT", precedence: 0 };
    case "||":
      return { associativity: "RIGHT", precedence: 2 };
    case "&&":
      return { associativity: "RIGHT", precedence: 3 };
    case "==":
      return { associativity: "NON", precedence: 4 };
    case "/=":
      return { associativity: "NON", precedence: 4 };
    case "<":
      return { associativity: "NON", precedence: 4 };
    case ">":
      return { associativity: "NON", precedence: 4 };
    case "<=":
      return { associativity: "NON", precedence: 4 };
    case ">=":
      return { associativity: "NON", precedence: 4 };
    case "++":
      return { associativity: "RIGHT", precedence: 5 };
    case "+":
      return { associativity: "LEFT", precedence: 6 };
    case "-":
      return { associativity: "LEFT", precedence: 6 };
    case "*":
      return { associativity: "LEFT", precedence: 7 };
    case "/":
      return { associativity: "LEFT", precedence: 7 };
    case "//":
      return { associativity: "LEFT", precedence: 7 };
    case "^":
      return { associativity: "RIGHT", precedence: 8 };
    case "<<":
      return { associativity: "LEFT", precedence: 9 };
    case ">>":
      return { associativity: "RIGHT", precedence: 9 };
    case "::":
      return { associativity: "RIGHT", precedence: 5 };
  }

  throw new Error("Invalid operator");
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

type Field = {
  id: "Field";
  name: string;
  path: Path;
};
const Field = (name: string, path: Path): Field => ({
  id: "Field",
  name,
  path,
});

type Unbox = {
  id: "Unbox";
  path: Path;
};
const Unbox = (path: Path): Unbox => ({ id: "Unbox", path });

type Root = {
  id: "Root";
  name: string;
};
const Root = (name: string): Root => ({
  id: "Root",
  name,
});

type Path = Index | Field | Unbox | Root;

type Destructor = {
  name: string;
  path: Path;
};
const Destructor = (name: string, path: Path): Destructor => ({ name, path });

type CtorOpts = "Unbox" | "Enum" | "Normal";

const destruct = (pattern: SyntaxNode, path: Path): Destructor[] => {
  switch (pattern.type) {
    case "pattern": {
      const child = pattern.childForFieldName("child");

      if (child) {
        return destruct(child, path);
      }
      return [];
    }

    case "lower_pattern":
      return [Destructor(pattern.text, path)];

    case "tuple_pattern":
    case "cons_pattern":
    case "list_pattern":
      if (path.id === "Root") {
        return pattern.namedChildren.flatMap((c, i) =>
          destruct(c, Index(i, path)),
        );
      } else {
        const name = "_v";
        const newRoot = Root(name);
        return [
          Destructor(name, path),
          ...pattern.namedChildren.flatMap((c, i) =>
            destruct(c, Index(i, newRoot)),
          ),
        ];
      }

    case "record_pattern":
      return pattern.namedChildren
        .filter((c) => c.type === "lower_pattern")
        .map((c) => Destructor(c.text, Field(c.text, path)));

    case "union_pattern":
      {
        const unionPattern = mapSyntaxNodeToExpression(
          pattern,
        ) as EUnionPattern;
        const unionVariants =
          findDefinition(
            unionPattern.constructor.firstNamedChild,
            findProgramOfNode(unionPattern.constructor),
          ).expr?.parent?.children.filter((n) => n.type === "union_variant") ??
          [];

        const opts: CtorOpts =
          unionVariants.length === 1
            ? "Unbox"
            : unionVariants.every((u) => u.namedChildren.length === 1)
            ? "Enum"
            : "Normal";

        if (unionPattern.argPatterns.length === 1) {
          switch (opts) {
            case "Unbox":
              return destruct(unionPattern.argPatterns[0], Unbox(path));

            case "Normal":
            case "Enum":
              return destruct(unionPattern.argPatterns[0], Index(0, path));
          }
        } else {
          if (path.id === "Root") {
            return unionPattern.argPatterns.flatMap((c, i) =>
              destruct(c, Index(i, path)),
            );
          } else {
            const name = "_v";
            return [
              Destructor(name, path),
              ...unionPattern.argPatterns.flatMap((c, i) =>
                destruct(c, Index(i, Root(name))),
              ),
            ];
          }
        }
      }
      break;

    default:
      return [];
  }
};
