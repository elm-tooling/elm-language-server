/* eslint-disable @typescript-eslint/naming-convention */
import {
  DiagnosticSeverity,
  DiagnosticTag,
  Range,
} from "vscode-languageserver";
import { Node } from "web-tree-sitter";
import { PositionUtil } from "../common/positionUtil";
import { DiagnosticSource } from "../common/providers/diagnostics/diagnosticSource";
import { getSpaces } from "../common/util/refactorEditUtils";

export interface Diagnostic {
  code: string;
  message: string;
  source: DiagnosticSource;
  severity: DiagnosticSeverity;
  range: Range;
  uri: string;
  tags?: DiagnosticTag[];
}

function format(text: string, ...args: (string | number)[]): string {
  return text.replace(/{(\d+)}/g, (_match, index: string) => `${args[+index]}`);
}

export function errorWithEndNode(
  node: Node,
  diagnostic: IDiagnosticMessage,
  endNode?: Node,
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
    source: "Elm",
    uri: node.tree.uri,
  };
}

export function error(
  node: Node,
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
  AmbiguousType: diag(
    "ambiguous_type",
    "The usage of the type `{0}` is ambiguous because it is exposed by multiple imports.",
    DiagnosticSeverity.Error,
  ),
  AmbiguousVar: diag(
    "ambiguous_var",
    "The usage of the variable `{0}` is ambiguous because it is exposed by multiple imports.",
    DiagnosticSeverity.Error,
  ),
  AmbiguousVariant: diag(
    "ambiguous_variant",
    "The usage of the variant `{0}` is ambiguous because it is exposed by multiple imports.",
    DiagnosticSeverity.Error,
  ),
  ArgumentCount: diag(
    "argument_count",
    "`{0}` is not a function, but it was given {1} arguments.",
    DiagnosticSeverity.Error,
  ),
  CyclicDefinition: diag(
    "cyclic_definition",
    "Value cannot be defined in terms of itself.",
    DiagnosticSeverity.Error,
  ),
  ExportNotFound: diag(
    "export_not_found",
    "Cannot find a {0} named `{1}` to expose.",
    DiagnosticSeverity.Error,
  ),
  ExportOpenAlias: diag(
    "export_open_alias",
    "Cannot use (..) when exposing a type alias.",
    DiagnosticSeverity.Error,
  ),
  FieldAccessOnNonRecord: diag(
    "field_access_on_non_record",
    "Cannot access fields on non-record type: `{0}`.",
    DiagnosticSeverity.Error,
  ),
  General: diag("general", "General error: {0}", DiagnosticSeverity.Error),
  ImportExposingNotFound: diag(
    "import_exposing_not_found",
    "The `{0}` module does not expose `{1}`.",
    DiagnosticSeverity.Error,
  ),
  ImportMissing: diag(
    "import_resolve",
    "Could not find a module to import named `{0}` in `dependencies` or `source-directories`.",
    DiagnosticSeverity.Error,
  ),
  ImportOpenAlias: diag(
    "import_open_alias",
    "The `{0}` type alias cannot be followed by (..).",
    DiagnosticSeverity.Error,
  ),
  IncompleteCasePattern: (n: number): IDiagnosticMessage =>
    diag(
      "incomplete_case_pattern",
      `This \`case\` does not have branches for all possibilities.\nMissing possibilities include:\n${getSpaces(
        2,
      )}${Array.from(Array(n))
        .map((_, i) => `{${i}}`)
        .join(`\n${getSpaces(2)}`)}\n`,
      DiagnosticSeverity.Error,
    ),
  InvalidPattern: diag(
    "invalid_pattern",
    "Invalid pattern error.\nExpected: `{0}`\nFound: `{1}`",
    DiagnosticSeverity.Error,
  ),
  MissingTypeAnnotation: diag(
    "missing_type_annotation",
    "Missing type annotation: `{0}`.",
    DiagnosticSeverity.Information,
  ),
  MissingValue: diag(
    "missing_value",
    "No definition found for `{0}`.",
    DiagnosticSeverity.Error,
  ),
  NonAssociativeOperator: diag(
    "non_associative_operator",
    "Non associative operator.",
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
    "Pattern does not cover all possibilities.",
    DiagnosticSeverity.Error,
  ),
  RecordBaseId: diag(
    "record_base_id",
    "Type must be a record, instead found: `{0}`.",
    DiagnosticSeverity.Error,
  ),
  RecordField: diag(
    "record_field",
    "The record does not have a `{0}` field.",
    DiagnosticSeverity.Error,
  ),
  RecursiveAlias: (n: number): IDiagnosticMessage =>
    diag(
      "recursive_alias",
      n < 2
        ? "Alias problem. This type alias is recursive, forming an infinite type."
        : `Alias problem. This type alias is part of a mutually recursive set of type aliases:\n${Array.from(
            Array(n).keys(),
          )
            .map((i) => `{${i}}`)
            .join(" -> ")}`,
      DiagnosticSeverity.Error,
    ),
  RecursiveDeclaration: (n: number): IDiagnosticMessage =>
    diag(
      "recursive_declaration",
      n < 2
        ? "Cyclic definition. The value `{0}` is defined directly in terms of itself, causing an infinite loop."
        : `Cyclic definition. The value \`{0}\`  depends on itself through the following chain of definitions:\n${Array.from(
            Array(n).keys(),
          )
            .map((i) => `{${i}}`)
            .join(" -> ")}`,
      DiagnosticSeverity.Error,
    ),
  RecursiveLet: (n: number): IDiagnosticMessage =>
    diag(
      "recursive_let",
      n < 2
        ? "Cyclic value. The value `{0}` is defined directly in terms of itself, causing an infinite loop."
        : `Cyclic value. The value \`{0}\` depends on itself through the following chain of definitions:\n${Array.from(
            Array(n).keys(),
          )
            .map((i) => `{${i}}`)
            .join(" -> ")}`,
      DiagnosticSeverity.Error,
    ),
  Redefinition: diag(
    "redefinition",
    "A value named `{0}` is already defined.",
    DiagnosticSeverity.Error,
  ),
  RedundantPattern: diag(
    "redundant_pattern",
    "The {0} pattern is redundant",
    DiagnosticSeverity.Error,
  ),
  TypeArgumentCount: diag(
    "type_argument_count",
    "The type expected {0} arguments, but got {1} instead.",
    DiagnosticSeverity.Error,
  ),
  TypeMismatch: diag(
    "type_mismatch",
    "Type mismatch error.\nExpected: `{0}`\nFound: `{1}`",
    DiagnosticSeverity.Error,
  ),
};
