import { Expression } from "./expressionTree";
import { SyntaxNodeMap } from "./syntaxNodeMap";

export type OperatorAssociativity = "LEFT" | "RIGHT" | "NON";

export interface IOperatorPrecedence {
  precedence: number;
  associativity: OperatorAssociativity;
}

export class BinaryExprTree {
  private static DEFAULT_PRECEDENCE = -1;

  public type: "Operand" | "Binary";

  constructor(type: "Operand" | "Binary") {
    this.type = type;
  }

  public static parse(
    expression: Expression[],
    operatorPrecedences: SyntaxNodeMap<Expression, IOperatorPrecedence>,
  ): BinaryExprTree {
    return BinaryExprTree.parseExpression(
      expression,
      operatorPrecedences,
      BinaryExprTree.DEFAULT_PRECEDENCE,
      0,
    )[0];
  }

  private static parseExpression(
    expression: Expression[],
    operatorPrecedences: SyntaxNodeMap<Expression, IOperatorPrecedence>,
    precedence: number,
    index: number,
  ): [BinaryExprTree, number] {
    let left: BinaryExprTree = new Operand(expression[index]);

    if (index >= expression.length - 1) {
      return [left, index + 1];
    }

    let i = index + 1;

    function nextPrecendence(): number {
      if (i >= expression.length - 1) {
        return BinaryExprTree.DEFAULT_PRECEDENCE;
      } else {
        return (
          operatorPrecedences.get(expression[i])?.precedence ??
          BinaryExprTree.DEFAULT_PRECEDENCE
        );
      }
    }

    while (precedence < nextPrecendence()) {
      const operator = expression[i];
      const funcPrecedence = operatorPrecedences.get(operator);
      const rightPrecedence =
        funcPrecedence?.associativity === "RIGHT"
          ? funcPrecedence.precedence - 1
          : funcPrecedence?.precedence ?? BinaryExprTree.DEFAULT_PRECEDENCE;

      const result = BinaryExprTree.parseExpression(
        expression,
        operatorPrecedences,
        rightPrecedence,
        i + 1,
      );
      left = new Binary(left, operator, result[0]);
      i = result[1];
    }

    return [left, i];
  }
}

export class Operand extends BinaryExprTree {
  public operand: Expression;

  constructor(operand: Expression) {
    super("Operand");
    this.operand = operand;
  }
}

export class Binary extends BinaryExprTree {
  public left: BinaryExprTree;
  public operator: Expression;
  public right: BinaryExprTree;

  constructor(
    left: BinaryExprTree,
    operator: Expression,
    right: BinaryExprTree,
  ) {
    super("Binary");
    this.left = left;
    this.operator = operator;
    this.right = right;
  }
}
