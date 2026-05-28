// Tier definitions
// guest = not logged in, free = signed up, pro = subscribed

export const TIERS = {
  guest: {
    key: 'guest',
    label: 'Guest',
    dailyLimit: 0,
    color: '#6b7280',
    badgeBg: '#f3f4f6',
    badgeText: '#6b7280',
    canGenerate: false,
  },
  free: {
    key: 'free',
    label: 'Free',
    dailyLimit: 3,
    color: '#2563eb',
    badgeBg: '#eff6ff',
    badgeText: '#1d4ed8',
    canGenerate: true,
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    dailyLimit: Infinity,
    color: '#d97706',
    badgeBg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
    badgeText: '#92400e',
    canGenerate: true,
  },
};

/**
 * Check if the stored generation date is today (local time).
 * If not, the counter should be reset to 0.
 */
function isToday(dateString) {
  if (!dateString) return false;
  const stored = new Date(dateString + 'T00:00:00');
  const now = new Date();
  return (
    stored.getFullYear() === now.getFullYear() &&
    stored.getMonth() === now.getMonth() &&
    stored.getDate() === now.getDate()
  );
}

/**
 * Compute the user's effective tier info from their profile row.
 *
 * @param {object|null} profile — the user_profiles row
 * @param {object|null} session — the Supabase session
 * @returns {{ tier, used, limit, remaining, canGenerate, needsReset }}
 */
export function getTierInfo(profile, session) {
  if (!session) {
    return {
      tier: TIERS.guest,
      used: 0,
      limit: 0,
      remaining: 0,
      canGenerate: false,
      needsReset: false,
    };
  }

  const tierKey = profile?.tier || 'free';
  const tier = TIERS[tierKey] || TIERS.free;

  const needsReset = !isToday(profile?.last_generation_date);
  const used = needsReset ? 0 : (profile?.generations_today || 0);
  const limit = tier.dailyLimit;
  const remaining = limit === Infinity ? Infinity : Math.max(0, limit - used);
  const canGenerate = tier.canGenerate && remaining > 0;

  return { tier, used, limit, remaining, canGenerate, needsReset };
}
