/**
 * BINPC2 Event Hub campaign-policy delta — 2026-10-27 V7.
 *
 * PURE POLICY ONLY; this file does not expose endpoints, mutate production data,
 * perform payments or alter the app's existing admission clock.
 * Live V6 Event Hub's API/database are not present on GitHub main as of this delta.
 * Integrate on top of the existing V6 commit, never recreate V6 application flows.
 */

export type EventKind = 'halloween' | 'tour';
export type TourRound = 1 | 2 | 3;
export type ThemeKey = 'default' | 'halloween';
export type GiftKind = 'led_ring' | 'halloween_keychain' | 'led_band' | 'led_necklace';
export type HalloweenDay = '2026-10-30' | '2026-10-31';
export type SignupRoute = 'binpc2' | 'open_chat';

export const MINIMUM_CONFIRMED_ATTENDEES = 5;
export const PUBLIC_PARTICIPATION_NOTICE =
  '인원질문, 간보기 등은 받지 않으며, 인원과 회비에 크게 신경쓰지 않으시는 분만 신청 부탁드립니다.';

export const AGE_POLICY_2026 = {
  minDisplayedAge: 20,
  maxDisplayedAge: 36,
  // Korean counting age in event year (as indicated by earlier original posters).
  minBirthYear: 1991,
  maxBirthYear: 2007,
  idCheckRequired: true,
  // Prior special photo/ID review cohort; NOT a different age exclusion rule.
  additionalIdAttentionBirthYears: [1993, 2003, 2004, 2005, 2006, 2007],
} as const;

export const EVENT_THEMES = {
  default: {
    key: 'default',
    colors: { surface: '#0E1826', accent: '#16A6A6', text: '#F9FAFB' },
    decoration: 'none',
  },
  halloween: {
    key: 'halloween',
    colors: { surface: '#1B1028', accent: '#F28D36', text: '#FFF5EA' },
    decoration: 'pumpkin-stars',
  },
} as const;

/** Admin-selected key can switch later; unknown values fail safe to default. */
export function resolveThemeKey(eventKind: EventKind, configured?: string): ThemeKey {
  if (configured === 'default' || configured === 'halloween') return configured;
  return eventKind === 'halloween' ? 'halloween' : 'default';
}

export const HALLOWEEN_STOCK = {
  led_ring: 40,
  halloween_keychain: 24,
  led_band: 2,
  led_necklace: 6,
} as const satisfies Record<GiftKind, number>;

/** Overall Friday / Saturday share ~30 / 70; owner overrides LED rings to 15 / 25. */
export const HALLOWEEN_DAILY_ALLOCATION = {
  '2026-10-30': { led_ring: 15, halloween_keychain: 5, led_band: 1, led_necklace: 1 },
  '2026-10-31': { led_ring: 25, halloween_keychain: 19, led_band: 1, led_necklace: 5 },
} as const satisfies Record<HalloweenDay, Record<GiftKind, number>>;

export const HALLOWEEN_RULES = {
  dates: ['2026-10-30', '2026-10-31'] as const,
  ticketLimitPerPersonPerDate: 3,
  giftAwardRequiresAdminCheckIn: true,
  hariboForEachCheckedInAttendee: true,
  noProjector: true,
  minimumConfirmedAttendees: MINIMUM_CONFIRMED_ATTENDEES,
  applicationCompletedOnlyAfterDepositApprovedAndParticipationConfirmed: true,
  // Historical fixed-price ranking is NOT a tour 1/N discount.
  rankPriceByDate: {
    '2026-10-30': { rank1: 0, rank2: 12000, rank3: 14000, ranks4to5: 16000, ranks6to10: 18000, before21: 20000, regular: 23000 },
    '2026-10-31': { rank1: 0, ranks2to3: 10000, ranks4to5: 13000, ranks6to10: 15000, ranks11to15: 18000, before21: 22000, regular: 25000 },
  },
  firstRoundTime: {
    '2026-10-30': { start: '22:30', end: '01:00' },
    '2026-10-31': { start: '22:00', end: '00:30' },
  },
} as const;

export const TOUR_WEEKS = [
  { key: 'incheon', region: '인천', start: '2026-11-05', end: '2026-11-08', venues: ['레드홀', '페이크'] },
  { key: 'jongno', region: '종로', start: '2026-11-12', end: '2026-11-15', venues: ['자크'] },
  { key: 'gwangju', region: '광주', start: '2026-11-19', end: '2026-11-22', venues: ['M가라오케', '스피드'] },
  { key: 'sillim', region: '신림', start: '2026-11-26', end: '2026-11-29', venues: ['체크인', '온탑'] },
] as const;

/** DAEGU is a *candidate* only and must never be included in published tours. */
export const PROPOSED_DAEGU = {
  region: '대구', status: 'UNCONFIRMED',
  proposedStart: '2026-12-03', proposedEnd: '2026-12-06',
  proposedFirstRoundVenue: '블랙',
} as const;

function parseIsoDay(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.getUTCDay(); // Sun=0, Thu=4, Fri=5, Sat=6
}

export function findConfirmedTourWeek(isoDate: string) {
  if (parseIsoDay(isoDate) === null) return null;
  return TOUR_WEEKS.find((w) => isoDate >= w.start && isoDate <= w.end) ?? null;
}

export function isTourEventDay(isoDate: string): boolean {
  const day = parseIsoDay(isoDate);
  return findConfirmedTourWeek(isoDate) !== null && (day === 0 || day === 4 || day === 5 || day === 6);
}

export function tourSignupRoute(isoDate: string, round: TourRound): SignupRoute | null {
  if (!isTourEventDay(isoDate)) return null;
  return round === 2 ? 'open_chat' : 'binpc2';
}

export function tourSessionHours(isoDate: string): {
  first: { start: string; end: string };
  second: { start: string; end: string };
  third: { start: string; end: null };
} | null {
  if (!isTourEventDay(isoDate)) return null;
  const day = parseIsoDay(isoDate);
  if (day === 4 || day === 0) {
    return { first: {start:'21:00',end:'23:30'}, second:{start:'23:30',end:'01:30'}, third:{start:'01:30',end:null} };
  }
  return { first: {start:'22:00',end:'00:30'}, second:{start:'00:30',end:'02:30'}, third:{start:'02:30',end:null} };
}

export const TOUR_RULES = {
  settlement: 'actual_shared_cost_divided_by_participants',
  depositBeforeAdminApproval: true,
  depositAmountKrw: null, // Owner has NOT confirmed a nationwide tour deposit amount.
  registrationCompletedOnlyAfterDepositVerificationAndAdminConfirmation: true,
  separateActualCostReconciliationPerDateAndRound: true,
  secondRoundExternalOpenChatOnly: true,
  firstAndThirdRoundBinpc2Only: true,
  thursdayAndSundayMode: 'quiet_conversation',
  fridayAndSaturdayMode: 'nostalgia_draw',
  nostalgiaFirstNConfirmedApplicantsPerDate: 10,
  nostalgiaDrawLimitPerEligiblePersonPerDate: 2,
  minConfirmedAttendees: MINIMUM_CONFIRMED_ATTENDEES,
} as const;

/** The 10-person limit spans rounds 1 and 3 on the SAME calendar event date.
 * rank MUST be a server-established date-wide BINPC2 order, never local per round.
 * No 2nd-round users may draw through the BINPC2 flow.
 */
export function canUseTourNostalgiaDraw(input: {
  eventDate: string;
  round: TourRound;
  dateWideConfirmedPriorityRank: number;
  depositApproved: boolean;
  participantConfirmed: boolean;
  checkedIn: boolean;
  alreadyUsedDraws: number;
}): boolean {
  if (!isTourEventDay(input.eventDate)) return false;
  const day = parseIsoDay(input.eventDate);
  if (day !== 5 && day !== 6) return false;
  if (tourSignupRoute(input.eventDate, input.round) !== 'binpc2') return false;
  if (!Number.isInteger(input.dateWideConfirmedPriorityRank) || input.dateWideConfirmedPriorityRank < 1 || input.dateWideConfirmedPriorityRank > 10) return false;
  if (!input.depositApproved || !input.participantConfirmed || !input.checkedIn) return false;
  if (!Number.isInteger(input.alreadyUsedDraws) || input.alreadyUsedDraws < 0 || input.alreadyUsedDraws >= 2) return false;
  return true;
}

export function canUseHalloweenDraw(input: {
  eventDate: string;
  paidOrAdminWaived: boolean;
  participantConfirmed: boolean;
  checkedIn: boolean;
  alreadyUsedDraws: number;
}): boolean {
  if (input.eventDate !== '2026-10-30' && input.eventDate !== '2026-10-31') return false;
  return input.paidOrAdminWaived && input.participantConfirmed && input.checkedIn && Number.isInteger(input.alreadyUsedDraws) && input.alreadyUsedDraws >= 0 && input.alreadyUsedDraws < 3;
}

export function allocatedGiftCount(day: HalloweenDay): number {
  return Object.values(HALLOWEEN_DAILY_ALLOCATION[day]).reduce((sum, n) => sum + n, 0);
}

export function verifyHalloweenAllocation(): boolean {
  return (Object.keys(HALLOWEEN_STOCK) as GiftKind[]).every((k) =>
    HALLOWEEN_DAILY_ALLOCATION['2026-10-30'][k] >= 0 &&
    HALLOWEEN_DAILY_ALLOCATION['2026-10-31'][k] >= 0 &&
    HALLOWEEN_DAILY_ALLOCATION['2026-10-30'][k] + HALLOWEEN_DAILY_ALLOCATION['2026-10-31'][k] === HALLOWEEN_STOCK[k]
  ) && allocatedGiftCount('2026-10-30') === 22 && allocatedGiftCount('2026-10-31') === 50;
}

export type TourRegistrationState =
  'draft' | 'form_submitted' | 'deposit_reported' | 'deposit_verified' | 'confirmed' | 'verified_waitlist' | 'cancelled';

/** Submitted form and reported payment are NOT 'application complete'. */
export function isApplicationComplete(state: TourRegistrationState): boolean {
  return state === 'confirmed';
}

export function canProceedWithEvent(confirmedPeople: number): boolean {
  return Number.isInteger(confirmedPeople) && confirmedPeople >= MINIMUM_CONFIRMED_ATTENDEES;
}

/** Reporting-only reconciliation. A surplus triggers operator review; NEVER discard money. */
export function calculateTourSettlement(input: {
  sharedRoundTotalKrw: number;
  confirmedRoundParticipants: number;
  advanceDepositKrw: number;
  individualExtrasKrw?: number;
}): { individualShareKrw: number; additionalPaymentKrw: number; operatorReviewExcessKrw: number } | null {
  const { sharedRoundTotalKrw: shared, confirmedRoundParticipants: count, advanceDepositKrw: deposit, individualExtrasKrw: extra = 0 } = input;
  if (![shared,count,deposit,extra].every(Number.isInteger) || shared < 0 || count < 1 || deposit < 0 || extra < 0) return null;
  const share = Math.ceil(shared / count);
  const delta = share + extra - deposit;
  return { individualShareKrw: share + extra, additionalPaymentKrw: Math.max(0,delta), operatorReviewExcessKrw: Math.max(0,-delta) };
}

/** Do not auto-decide gender/gender-identity eligibility or gather sensitive identity fields. */
export const FRIDAY_EXTRA_ELIGIBILITY_REVIEW = {
  status: 'HUMAN_POLICY_AND_LEGAL_REVIEW_REQUIRED',
  automatedSensitiveAttributeScreening: false,
} as const;
