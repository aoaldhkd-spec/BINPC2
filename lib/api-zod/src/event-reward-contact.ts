import type { HubApplication } from './event-hub';

/** Contact is optional and only justified by an actual physical-item/cash receipt.
 * A discount, draw win alone, or an unclassified legacy result is insufficient. */
export function canRequestRewardContact(
  application: Pick<HubApplication, 'cards' | 'prizesGiven' | 'manualResults'>,
  source: 'card' | 'result',
  resultId: string,
  campaignKind?: string,
): boolean {
  if (source === 'card') {
    // Generic legacy stock has no immutable item/discount classification.
    // Only the fixed Halloween physical-prize policy is known here.
    if (!['halloween-friday','halloween-saturday'].includes(campaignKind??'') || !application.prizesGiven.includes(resultId)) return false;
    const card = application.cards.find(value => value.id === resultId);
    return !!card && card.prize !== '다음 기회에' && card.prize !== '꽝' && card.couponAmount === undefined;
  }
  const result = application.manualResults?.find(value => value.id === resultId);
  return !!result?.paidAt && (result.kind === 'item' || (result.kind === 'cash' && result.amount > 0));
}
