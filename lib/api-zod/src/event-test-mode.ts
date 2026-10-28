/** Only the flag and maintenance message are exposed to public clients. */
export const EVENT_TEST_MODE_BANNER = "현재 테스트 및 점검 중입니다. 테스트 완료 후 신청이 오픈됩니다.";

export type PublicEventTestMode = {
  enabled: boolean;
  banner: string;
};

export type EventTestModeState = PublicEventTestMode & {
  generation: number;
  revision: number;
  dirty: boolean;
  resetGeneration: number | null;
  resetAt: string | null;
  changedAt: string;
};

export type EventLaboratoryState = {
  mode: EventTestModeState;
  workspaces: Record<string, unknown>;
};

export type EventLaboratoryCommand = {
  generation: number;
  revision: number;
} & (
  | { operation: "save"; workspaceId: string; snapshot: unknown }
  | { operation: "reset" }
  | { operation: "mode"; enabled: boolean; resetGeneration?: number }
);
