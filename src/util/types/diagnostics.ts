import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { PositionUtil } from "../../positionUtil";

function format(text: string, ...args: (string | number)[]): string {
  return text.replace(/{(\d+)}/g, (_match, index: string) => `${args[+index]}`);
}

export function errorWithEndNode(
  node: SyntaxNode,
  diagnostic: IDiagnosticMessage,
  endNode?: SyntaxNode,
  ...args: (string | number)[]
): Diagnostic {
  return {
    range: {
      start: PositionUtil.FROM_TS_POSITION(node.startPosition).toVSPosition(),
      end: PositionUtil.FROM_TS_POSITION(
        endNode?.endPosition ?? node.endPosition,
      ).toVSPosition(),
    },
    message: format(diagnostic.message, ...args),
    code: diagnostic.code,
    severity: diagnostic.severity,
    source: "elm",
    data: { uri: node.tree.uri },
  };
}

export function error(
  node: SyntaxNode,
  diagnostic: IDiagnosticMessage,
  ...args: (string | number)[]
): Diagnostic {
  return errorWithEndNode(node, diagnostic, undefined, ...args);
}

export interface IDiagnosticMessage {
  code: string;
  message: string;
  severity: DiagnosticSeverity;
}

function diag(
  code: string,
  message: string,
  severity: DiagnosticSeverity,
): IDiagnosticMessage {
  return { code, message, severity };
}

export const Diagnostics = {
  ArgumentCount: diag(
    "argument_count",
    "{0} is not a function, but it was given {1} arguments.",
    DiagnosticSeverity.Error,
  ),
  CyclicDefinition: diag(
    "cyclic_definition",
    "Value cannot be defined in terms of itself.",
    DiagnosticSeverity.Error,
  ),
  FieldAccessOnNonRecord: diag(
    "field_access_on_non_record",
    "Cannot access fields on non-record type: {0}",
    DiagnosticSeverity.Error,
  ),
  General: diag("general", "General error: {0}", DiagnosticSeverity.Error),
  InfiniteRecursion: diag(
    "infinite_recursion",
    "Infinite recursion.",
    DiagnosticSeverity.Error,
  ),
  InvalidPattern: diag(
    "invalid_pattern",
    "Invalid pattern error\nExpected: {0}\nFound: {1}",
    DiagnosticSeverity.Error,
  ),
  MissingTypeAnnotation: diag(
    "missing_type_annotation",
    "Missing type annotation: `{0}`.",
    DiagnosticSeverity.Information,
  ),
  MissingValue: diag(
    "missing_value",
    "No definition found for `{0}`",
    DiagnosticSeverity.Error,
  ),
  NonAssociativeOperator: diag(
    "non_associative_operator",
    "NonAssociativeOperator.",
    DiagnosticSeverity.Error,
  ),
  ParameterCountError: diag(
    "parameter_count",
    "The {0} `{1}` expects {2} arguments, but got {3} instead.",
    DiagnosticSeverity.Error,
  ),
  Parsing: diag("parsing", "Parsing error.", DiagnosticSeverity.Error),
  PartialPattern: diag(
    "partial_pattern",
    "Pattern does not cover all posiblities.",
    DiagnosticSeverity.Error,
  ),
  RecordBaseId: diag(
    "record_base_id",
    "Type must be a record, instead found: {0}.",
    DiagnosticSeverity.Error,
  ),
  RecordField: diag(
    "record_field",
    "The record does not have a `{0}` field.",
    DiagnosticSeverity.Error,
  ),
  Redefinition: diag(
    "redefinition",
    "A value named `{0}` is already defined.",
    DiagnosticSeverity.Error,
  ),
  TypeArgumentCount: diag(
    "type_argument_count",
    "The type expected {0} arguments, but got {1} instead.",
    DiagnosticSeverity.Error,
  ),
  TypeMismatch: diag(
    "type_mismatch",
    "Type mismatch error\nExpected: {0}\nFound: {1}",
    DiagnosticSeverity.Error,
  ),
};
