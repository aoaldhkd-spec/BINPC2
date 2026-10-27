import { z } from "zod";
export const VerificationVersion = z
  .string()
  .regex(/^(?:[a-f0-9]{40}(?:-dirty-[a-f0-9]{12})?|UNKNOWN)$/);
export const VerificationRun = z.object({
  id: z.string().min(1).max(100),
  sourceVersion: VerificationVersion,
  codeFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  environment: z.string().min(1).max(300),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  reportUrl: z
    .string()
    .regex(
      /^https:\/\/github\.com\/aoaldhkd-spec\/BINPC2\/(?:actions\/runs\/\d+|blob\/[^\s]+)$/,
    ),
  checks: z
    .array(
      z.object({
        id: z.string().max(100),
        title: z.string().max(200),
        kind: z.enum([
          "unit",
          "postgres",
          "browser",
          "mixed-http-postgres",
          "laboratory",
          "physical-device",
          "guard",
          "build",
        ]),
        status: z.enum(["PASS", "FAIL", "NOT_RUN", "UNKNOWN"]),
        reason: z.string().max(2000).optional(),
        count: z.number().int().min(0).optional(),
      }),
    )
    .max(100),
});
export const VerificationHistory = z.object({
  schemaVersion: z.literal(1),
  runs: z.array(VerificationRun).max(500),
});
export type VerificationHistoryData = z.infer<typeof VerificationHistory>;
export type VerificationResponse = {
  currentVersion: string;
  currentFingerprint?: string;
  builtAt?: string;
  error?: string;
  runs: (z.infer<typeof VerificationRun> & { historical: boolean })[];
};
export function classifyVerificationHistory(
  history: VerificationHistoryData,
  currentVersion: string,
  currentFingerprint?: string,
): VerificationResponse {
  return {
    currentVersion,
    currentFingerprint,
    runs: history.runs
      .slice()
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((r) => ({
        ...r,
        historical:
          currentVersion === "UNKNOWN" ||
          (r.codeFingerprint && currentFingerprint
            ? r.codeFingerprint !== currentFingerprint
            : r.sourceVersion !== currentVersion),
      })),
  };
}
