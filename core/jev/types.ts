export type JevChoice = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};
export type JevAssessment = {
  fingerprint: string;
  assessedAt: string;
  model: string;
  match: JevChoice;
  arrangement: JevChoice;
  sponsorship: JevChoice;
  eligibility: JevChoice;
  locationEvidence: string | null;
  arrangementEvidence: string | null;
  eligibilityEvidence: string | null;
  sponsorshipEvidence: string | null;
  locations: {
    name: string;
    kind: "workplace" | "hiring";
    confidence: number;
  }[];
  usage: { input_tokens: number; output_tokens: number };
};
export type JevJob = {
  state: "pending" | "queued" | "running" | "completed" | "failed";
  error?: string;
  assessment?: JevAssessment;
  sourceLocation: string;
  sourceArrangement: string;
  originalScore: number;
};
export type JevSettings = { enabled: boolean; dailyLimit: number };
export type JevStatus = JevSettings & {
  configured: boolean;
  state: string;
  message: string | null;
  retryAt: string | null;
  used: number;
  inputTokens: number;
  outputTokens: number;
};
