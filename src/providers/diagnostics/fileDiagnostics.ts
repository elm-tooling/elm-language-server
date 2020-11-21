import { Diagnostic } from "vscode-languageserver";
import { Utils } from "../../util/utils";

export const enum DiagnosticKind {
  ElmMake,
  ElmAnalyse,
  ElmTest,
  TypeInference,
  ElmLS,
}

export function diagnosticsEquals(a: Diagnostic, b: Diagnostic): boolean {
  if (a === b) {
    return true;
  }

  return (
    a.code === b.code &&
    a.message === b.message &&
    a.severity === b.severity &&
    a.source === b.source &&
    Utils.rangeEquals(a.range, b.range) &&
    Utils.arrayEquals(
      a.relatedInformation ?? [],
      b.relatedInformation ?? [],
      (a, b) => {
        return (
          a.message === b.message &&
          Utils.rangeEquals(a.location.range, b.location.range) &&
          a.location.uri === b.location.uri
        );
      },
    ) &&
    Utils.arrayEquals(a.tags ?? [], b.tags ?? [])
  );
}

export class FileDiagnostics {
  private diagnostics: Map<DiagnosticKind, Diagnostic[]> = new Map<
    DiagnosticKind,
    Diagnostic[]
  >();

  constructor(public uri: string) {}

  public get(): Diagnostic[] {
    return [
      ...this.getForKind(DiagnosticKind.ElmMake),
      ...this.getForKind(DiagnosticKind.ElmTest),
      ...this.getForKind(DiagnosticKind.TypeInference),
      ...this.getForKind(DiagnosticKind.ElmLS),
    ];
  }

  public update(kind: DiagnosticKind, diagnostics: Diagnostic[]): boolean {
    const existing = this.getForKind(kind);
    if (Utils.arrayEquals(existing, diagnostics, diagnosticsEquals)) {
      return false;
    }

    this.diagnostics.set(kind, diagnostics);
    return true;
  }

  public getForKind(kind: DiagnosticKind): Diagnostic[] {
    return this.diagnostics.get(kind) ?? [];
  }
}
