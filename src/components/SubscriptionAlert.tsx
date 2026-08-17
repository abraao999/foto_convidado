import type { SubscriptionAlert } from '../types/subscription';

const levelClass: Record<SubscriptionAlert['level'], string> = {
  info: 'subscription-alert info',
  warning: 'subscription-alert warning',
  critical: 'subscription-alert critical',
  expired: 'subscription-alert expired',
};

export default function SubscriptionAlertBanner({ alert }: { alert: SubscriptionAlert | null }) {
  if (!alert) return null;
  return <p className={levelClass[alert.level]}>{alert.message}</p>;
}
