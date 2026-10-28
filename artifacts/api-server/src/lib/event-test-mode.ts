import {
  EVENT_TEST_MODE_BANNER,
  PUBLIC_ADMISSION_CLOSED_BANNER,
  z,
  type EventLaboratoryState,
  type EventTestModeState,
  type PublicEventTestMode,
} from "@workspace/api-zod";
import { fail, type HubStore, type HubTx } from "./event-hub-store.js";
import { publicationBlockedForTx } from "./event-hub-publication.js";

export const TEST_MODE_KIND = "laboratory-mode";
export const TEST_WORKSPACE_KIND = "laboratory-workspace";
const MODE_ID = "global";
const storedModeInput = z.object({
  enabled: z.boolean(),
  // Old persisted OFF states do not implicitly carry a public opening approval.
  publicAdmissionOpen: z.boolean().default(false),
  admissionOpenedAt: z.string().datetime().nullable().default(null),
  banner: z.string(),
  generation: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  dirty: z.boolean(),
  resetGeneration: z.number().int().nonnegative().nullable(),
  resetAt: z.string().datetime().nullable(),
  changedAt: z.union([z.literal(""), z.string().datetime()]),
}).refine(mode => mode.enabled || (!mode.dirty && mode.resetGeneration === mode.generation && mode.resetAt !== null))
  .refine(mode => mode.publicAdmissionOpen
    ? !mode.enabled && mode.admissionOpenedAt !== null
    : mode.admissionOpenedAt === null);
const initialMode = (): EventTestModeState => ({
  enabled: true,
  publicAdmissionOpen: false,
  admissionOpenedAt: null,
  banner: EVENT_TEST_MODE_BANNER,
  generation: 0,
  revision: 0,
  dirty: false,
  resetGeneration: null,
  resetAt: null,
  changedAt: "",
});

/** Use in the same advisory transaction as the protected business write. */
export async function readEventTestMode(tx: HubTx): Promise<EventTestModeState> {
  const stored = await tx.get<unknown>(TEST_MODE_KIND, MODE_ID);
  if (stored === undefined) return initialMode();
  const parsed = storedModeInput.safeParse(stored);
  if (!parsed.success)
    fail("TEST_MODE_STATE", "테스트 모드 상태를 확인할 수 없습니다. 관리자 확인 전 신청을 차단합니다.", 503);
  return parsed.data;
}

export function publicEventTestMode(mode: EventTestModeState): PublicEventTestMode {
  return {
    enabled: mode.enabled,
    publicAdmissionOpen: mode.publicAdmissionOpen,
    banner: mode.enabled ? EVENT_TEST_MODE_BANNER : mode.publicAdmissionOpen ? "" : PUBLIC_ADMISSION_CLOSED_BANNER,
  };
}

export async function assertTestModeAllowsPublicMutation(tx: HubTx) {
  const mode = await readEventTestMode(tx);
  if (mode.enabled)
    fail("TEST_MODE", EVENT_TEST_MODE_BANNER, 423);
  if (!mode.publicAdmissionOpen)
    fail("PUBLIC_ADMISSION_CLOSED", PUBLIC_ADMISSION_CLOSED_BANNER, 423);
}

const expected = {
  generation: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
};
const commandInput = z.discriminatedUnion("operation", [
  z.object({
    ...expected,
    operation: z.literal("save"),
    workspaceId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    snapshot: z.record(z.unknown()),
  }).strict(),
  z.object({ ...expected, operation: z.literal("reset") }).strict(),
  z.object({
    ...expected,
    operation: z.literal("mode"),
    enabled: z.boolean(),
    resetGeneration: z.number().int().nonnegative().optional(),
  }).strict(),
  z.object({
    ...expected,
    operation: z.literal("admission"),
    open: z.boolean(),
    confirmOpen: z.boolean().optional(),
  }).strict(),
]);

type Workspace = { id: string; generation: number; snapshot: Record<string, unknown> };
async function stateInTransaction(tx: HubTx, mode: EventTestModeState): Promise<EventLaboratoryState> {
  const rows = await tx.all<Workspace>(TEST_WORKSPACE_KIND);
  return {
    mode,
    workspaces: Object.fromEntries(rows.filter(row => row.generation === mode.generation)
      .map(row => [row.id, row.snapshot])),
  };
}

/** JSON snapshots have no route to the production application/profile/stock tables. */
export class EventTestModeService {
  constructor(readonly store: HubStore, readonly now: () => Date = () => new Date()) {}

  async publicState(): Promise<PublicEventTestMode> {
    return this.store.transaction(async tx => publicEventTestMode(await readEventTestMode(tx)));
  }

  async state(admin: boolean): Promise<EventLaboratoryState> {
    if (!admin) fail("ADMIN", "관리자 인증이 필요합니다.", 403);
    return this.store.transaction(async tx => stateInTransaction(tx, await readEventTestMode(tx)));
  }

  async mutate(admin: boolean, input: unknown): Promise<EventLaboratoryState> {
    if (!admin) fail("ADMIN", "관리자 인증이 필요합니다.", 403);
    const command = commandInput.parse(input);
    return this.store.transaction(async tx => {
      const mode = await readEventTestMode(tx);
      if (command.generation !== mode.generation || command.revision !== mode.revision)
        fail("STALE_LABORATORY", "다른 창에서 테스트 상태가 변경되었습니다. 최신 상태를 불러와 주세요.", 409);
      if (command.operation === "save") {
        if (!mode.enabled) fail("TEST_MODE_OFF", "테스트 모드를 켠 뒤 가상 체험을 시작해 주세요.", 409);
        if (Buffer.byteLength(JSON.stringify(command.snapshot), "utf8") > 2_000_000)
          fail("LABORATORY_SIZE", "테스트 기록이 너무 큽니다. 테스트 초기화 후 다시 시도해 주세요.", 413);
        const workspaces = await tx.all<Workspace>(TEST_WORKSPACE_KIND);
        if (!workspaces.some(row => row.id === command.workspaceId) && workspaces.length >= 20)
          fail("LABORATORY_LIMIT", "최대 20개의 테스트 행사만 저장할 수 있습니다.");
        await tx.put(TEST_WORKSPACE_KIND, command.workspaceId, {
          id: command.workspaceId,
          generation: mode.generation,
          snapshot: command.snapshot,
        } satisfies Workspace);
        mode.dirty = true;
        mode.resetGeneration = null;
        mode.resetAt = null;
      } else if (command.operation === "reset") {
        // This exact namespace is the sole deletion target. Never use the operating reset.
        await tx.db.query("DELETE FROM event_hub_records WHERE kind=$1", [TEST_WORKSPACE_KIND]);
        mode.generation++;
        mode.dirty = false;
        mode.resetGeneration = mode.generation;
        mode.resetAt = this.now().toISOString();
        mode.publicAdmissionOpen = false;
        mode.admissionOpenedAt = null;
      } else if (command.operation === "mode") {
        if (!command.enabled && (mode.dirty || mode.resetGeneration !== mode.generation
          || command.resetGeneration !== mode.generation))
          fail("TEST_RESET_REQUIRED", "테스트 기록 초기화를 확인한 뒤 테스트 모드를 해제해 주세요.", 409);
        if (command.enabled && !mode.enabled) {
          // A new testing session needs a fresh reset acknowledgement before reopening.
          mode.generation++;
          mode.resetGeneration = null;
          mode.resetAt = null;
        }
        mode.enabled = command.enabled;
        if (command.enabled) {
          mode.publicAdmissionOpen = false;
          mode.admissionOpenedAt = null;
        }
      } else {
        if (command.open) {
          if (command.confirmOpen !== true)
            fail("PUBLIC_ADMISSION_CONFIRM_REQUIRED", "실제 모집 오픈을 별도로 확인해 주세요.", 409);
          if (mode.enabled)
            fail("TEST_MODE", "테스트 모드가 켜져 있어 실제 모집을 열 수 없습니다.", 423);
          if (mode.dirty || mode.resetGeneration !== mode.generation || mode.resetAt === null)
            fail("TEST_RESET_REQUIRED", "현재 테스트 기록 초기화를 확인한 뒤 모집 오픈을 검토해 주세요.", 409);
          if (await publicationBlockedForTx(tx))
            fail("PRIVACY_POLICY_UNCONFIRMED", "운영 개인정보 정책과 별도 모집 승인을 확인하기 전 신규 접수는 차단됩니다.", 403);
        }
        mode.publicAdmissionOpen = command.open;
        mode.admissionOpenedAt = command.open ? this.now().toISOString() : null;
      }
      mode.revision++;
      mode.changedAt = this.now().toISOString();
      await tx.put(TEST_MODE_KIND, MODE_ID, mode);
      return stateInTransaction(tx, mode);
    });
  }
}
