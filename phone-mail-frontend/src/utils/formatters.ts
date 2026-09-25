const DOMAIN = 'phonemail.com';

/** Keep digits only. */
export const digitsOnly = (value: string) => value.replace(/\D/g, '');

/** Last 10 digits – PhoneMail IDs are 10-digit Indian mobile numbers. */
export const normalizePhone = (value: string) => digitsOnly(value).slice(-10);

/** 9876543211 → 9876543211@phonemail.com */
export const toEmail = (phone: string) => `${normalizePhone(phone)}@${DOMAIN}`;

/** 9876543211 → +91 98765 43211 */
export function formatPhone(phone: string) {
  const d = normalizePhone(phone);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : phone;
}

/** Grouping used while typing: "9876543211" → "98765 43211" */
export function groupPhone(digits: string) {
  const d = digitsOnly(digits).slice(0, 10);
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = ['#1a66ff', '#7c4dff', '#12b76a', '#e11d48', '#f59e0b', '#0b4fe0', '#0891b2'];

/** Stable colour per contact, so "Rahul" is always the same blue. */
export function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (d: Date) => Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);

export function formatClock(iso: string) {
  return new Date(iso)
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toUpperCase();
}

/** Mail-list stamp: 10:42 AM · Yesterday · Mon · 12 Sep */
export function formatListTime(iso: string) {
  const d = new Date(iso);
  const diff = daysAgo(d);
  if (diff <= 0) return formatClock(iso);
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Day divider inside a chat: Today · Yesterday · 21 Sep 2026 */
export function formatDay(iso: string) {
  const d = new Date(iso);
  const diff = daysAgo(d);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatFullDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
