interface UsageSummary {
  usedCredits?: number;
  remainingCredits?: number | null;
  monthlyCredits?: number | null;
  unlimitedCredits?: boolean;
  resetAt?: string;
}

const pluralize = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export const formatJourneyCreditLabel = (usage?: UsageSummary | null, fallbackCredits = 1) => {
  if (usage?.unlimitedCredits) return `${usage.usedCredits ?? 0} used / Unlimited`;

  const remainingCredits = usage?.remainingCredits ?? fallbackCredits;
  const monthlyCredits = usage?.monthlyCredits ?? fallbackCredits;
  return `${remainingCredits} / ${monthlyCredits} journey ${monthlyCredits === 1 ? 'credit' : 'credits'} left`;
};

export const formatJourneyCreditShortLabel = (usage?: UsageSummary | null, fallbackCredits = 1) => {
  if (usage?.unlimitedCredits) return 'Unlimited journey credits';

  const remainingCredits = usage?.remainingCredits ?? fallbackCredits;
  return `${remainingCredits} ${remainingCredits === 1 ? 'journey credit' : 'journey credits'} left`;
};

export const formatResetCountdown = (resetAt?: string | null, now = Date.now()) => {
  if (!resetAt) return 'Reset date unavailable';

  const resetTime = new Date(resetAt).getTime();
  if (!Number.isFinite(resetTime)) return 'Reset date unavailable';

  const remainingSeconds = Math.max(0, Math.ceil((resetTime - now) / 1000));
  if (remainingSeconds <= 0) return 'Resets now';

  const days = Math.floor(remainingSeconds / 86400);
  const hours = Math.floor((remainingSeconds % 86400) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);

  if (days > 0) {
    return `Resets in ${pluralize(days, 'day')}${hours > 0 ? `, ${pluralize(hours, 'hour')}` : ''}`;
  }

  if (hours > 0) {
    return `Resets in ${pluralize(hours, 'hour')}${minutes > 0 ? `, ${pluralize(minutes, 'minute')}` : ''}`;
  }

  if (minutes > 0) return `Resets in ${pluralize(minutes, 'minute')}`;
  return 'Resets in less than 1 minute';
};
