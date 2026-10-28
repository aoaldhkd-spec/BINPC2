/** Only public participation flags and a maintenance message leave the admin store. */
export const EVENT_TEST_MODE_BANNER = "현재 테스트 및 점검 중입니다. 테스트 완료 후 신청이 오픈됩니다.";
export const PUBLIC_ADMISSION_CLOSED_BANNER = "관리자 오픈 확인 전입니다. 웹·오픈채팅 모두 신규 신청을 받지 않으며 송금하지 마세요.";

export type PublicEventTestMode = {
  enabled: boolean;
  publicAdmissionOpen: boolean;
  banner: string;
};

export type EventTestModeState = PublicEventTestMode & {
  generation: number;
  revision: number;
  dirty: boolean;
  resetGeneration: number | null;
  resetAt: string | null;
  changedAt: string;
  admissionOpenedAt: string | null;
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
  | { operation: "admission"; open: boolean; confirmOpen?: boolean }
);
