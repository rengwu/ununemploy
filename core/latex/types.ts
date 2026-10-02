export type LatexDiagnostic = {
  severity: "error" | "warning";
  message: string;
  line?: number;
};
export type LatexVersion = {
  version: number;
  hash: string;
  createdAt: string;
  restoredFrom: number | null;
};
export type LatexDocument = LatexVersion & { source: string };
export type LatexContext = {
  current: LatexDocument;
  versions: LatexVersion[];
  previewHash: string | null;
  diagnostics: LatexDiagnostic[];
};
export type LatexBuild = { hash: string; diagnostics: LatexDiagnostic[] };
