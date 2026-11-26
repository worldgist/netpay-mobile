export const REFERRER_REWARD_AMOUNT = 200;

export function buildReferralCode(userId: string): string {
  return `REF-${userId.slice(0, 8).toUpperCase()}`;
}
