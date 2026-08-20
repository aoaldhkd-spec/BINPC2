import type { Profile } from '../types/app';

/**
 * 참여자 목록 순서 불변식:
 * - self(currentUserId) 가 있으면 맨 앞
 * - 그 외는 created_at DESC (없으면 뒤로)
 * - 동점이면 id ASC (항상 결정적 — updated_at / SSE 도착 순 / Map 삽입 순에 의존하지 않음)
 *
 * 프로필 패치·user_signals SSE 는 created_at/id 를 바꾸지 않으므로 자리가 흔들리지 않는다.
 */
export function compareProfilesStable(
  a: Pick<Profile, 'id' | 'created_at' | 'nickname'>,
  b: Pick<Profile, 'id' | 'created_at' | 'nickname'>,
  currentUserId?: string | null,
): number {
  if (currentUserId) {
    if (a.id === currentUserId) return -1;
    if (b.id === currentUserId) return 1;
  }
  const aTs = typeof a.created_at === 'string' ? a.created_at : '';
  const bTs = typeof b.created_at === 'string' ? b.created_at : '';
  if (aTs !== bTs) {
    if (!aTs) return 1;
    if (!bTs) return -1;
    return aTs < bTs ? 1 : -1; // DESC
  }
  const idCmp = String(a.id).localeCompare(String(b.id));
  if (idCmp !== 0) return idCmp;
  return String(a.nickname ?? '').localeCompare(String(b.nickname ?? ''), 'ko');
}

export function sortProfilesStable<T extends Pick<Profile, 'id' | 'created_at' | 'nickname'>>(
  profiles: readonly T[],
  currentUserId?: string | null,
): T[] {
  return [...profiles].sort((a, b) => compareProfilesStable(a, b, currentUserId));
}

/**
 * HTTP 리프레시 / SSE 패치 병합 시 기존 id 상대 순서를 유지하고,
 * 신규만 안정 키로 끼워 넣는다. 전체 재정렬에 기대지 않아도 패치만으로 자리가 안 바뀐다.
 */
/** Same DB row payload — keeps React memo refs stable across HTTP refresh when nothing changed */
export function profileRowEqual(a: Profile, b: Profile): boolean {
  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(aRec), ...Object.keys(bRec)]);
  for (const k of keys) {
    if (aRec[k] !== bRec[k]) return false;
  }
  return true;
}

export function mergeProfilesPreserveOrder(
  prev: readonly Profile[],
  incoming: readonly Profile[],
): Profile[] {
  const byId = new Map(incoming.map((p) => [p.id, p]));
  const kept: Profile[] = [];
  const keptIds = new Set<string>();
  for (const p of prev) {
    const next = byId.get(p.id);
    if (!next) continue;
    kept.push(profileRowEqual(p, next) ? p : { ...p, ...next });
    keptIds.add(p.id);
  }
  const newcomers = incoming.filter((p) => !keptIds.has(p.id));
  if (newcomers.length === 0) return kept;

  const out = [...kept];
  for (const neu of sortProfilesStable(newcomers)) {
    let insertAt = out.length;
    for (let i = 0; i < out.length; i++) {
      if (compareProfilesStable(neu, out[i]) < 0) {
        insertAt = i;
        break;
      }
    }
    out.splice(insertAt, 0, neu);
  }
  return out;
}

/** SSE UPDATE / 로컬 패치: 필드만 갱신, 배열 순서 불변 */
export function patchProfileInPlace(
  prev: readonly Profile[],
  patch: Profile,
): Profile[] {
  let changed = false;
  const next = prev.map((p) => {
    if (p.id !== patch.id) return p;
    const merged = { ...p, ...patch };
    if (profileRowEqual(p, merged)) return p;
    changed = true;
    return merged;
  });
  return changed ? next : prev;
}
