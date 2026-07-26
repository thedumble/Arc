import type {
  BuildingType,
  League,
  PrepStage,
  SubjectKey,
} from './types';

export const SUBJECTS: {
  key: SubjectKey;
  label: string;
  building: BuildingType;
  color: string;
  emoji: string;
}[] = [
  { key: 'GS1', label: 'GS1 · History & Culture', building: 'temple', color: '#B5651D', emoji: '🛕' },
  { key: 'GS2', label: 'GS2 · Polity & IR', building: 'government', color: '#6B7A8F', emoji: '🏛️' },
  { key: 'GS3', label: 'GS3 · Economy & Env.', building: 'tower', color: '#4CAF7D', emoji: '🏢' },
  { key: 'GS4', label: 'GS4 · Ethics', building: 'library', color: '#E0B341', emoji: '📚' },
  { key: 'ESSAY', label: 'Essay', building: 'townhall', color: '#C77B58', emoji: '⛪' },
  { key: 'OPTIONAL', label: 'Optional Subject', building: 'specialty', color: '#9B6B9E', emoji: '🗼' },
];

export const PREP_STAGES: {
  key: PrepStage;
  label: string;
  emoji: string;
  color: string;
  subtitle: string;
}[] = [
  { key: 'beginner', label: 'JUST STARTED', emoji: '🟤', color: '#8B6F47', subtitle: 'exploring UPSC' },
  { key: 'seeker', label: 'FOUNDATION', emoji: '⚪', color: '#C0C0C0', subtitle: 'building the basics' },
  { key: 'warrior', label: 'SERIOUS PREP', emoji: '🟡', color: '#FFD700', subtitle: 'dedicated aspirant' },
  { key: 'scholar', label: 'MAINS READY', emoji: '🔵', color: '#4A90D9', subtitle: 'advanced stage' },
  { key: 'topper', label: 'FINAL APPROACH', emoji: '🟢', color: '#4CAF7D', subtitle: 'interview/repeat' },
];

export const LEAGUES: {
  key: League;
  label: string;
  emoji: string;
  minHours: number;
}[] = [
  { key: 'BEGINNER', label: 'BEGINNER', emoji: '🌱', minHours: 0 },
  { key: 'SEEKER', label: 'SEEKER', emoji: '🔍', minHours: 10 },
  { key: 'WARRIOR', label: 'WARRIOR', emoji: '⚔️', minHours: 40 },
  { key: 'SCHOLAR', label: 'SCHOLAR', emoji: '📖', minHours: 100 },
  { key: 'TOPPER', label: 'TOPPER', emoji: '👑', minHours: 250 },
];

export const DURATIONS = [
  { label: '25 MIN', mins: 25 },
  { label: '45 MIN', mins: 45 },
  { label: '1H', mins: 60 },
  { label: '1.5H', mins: 90 },
  { label: '2H', mins: 120 },
  { label: 'CUSTOM', mins: 0 },
];

export const REACTIONS: { type: 'fire' | 'bolt' | 'salute'; emoji: string; label: string }[] = [
  { type: 'fire', emoji: '🔥', label: 'Fire' },
  { type: 'bolt', emoji: '⚡', label: 'Bolt' },
  { type: 'salute', emoji: '🫡', label: 'Salute' },
];

export function leagueForHours(hours: number): {
  current: (typeof LEAGUES)[number];
  next: (typeof LEAGUES)[number] | null;
  progress: number;
} {
  let current = LEAGUES[0];
  let next: (typeof LEAGUES)[number] | null = null;
  for (let i = 0; i < LEAGUES.length; i++) {
    if (hours >= LEAGUES[i].minHours) {
      current = LEAGUES[i];
      next = LEAGUES[i + 1] ?? null;
    }
  }
  const progress = next
    ? Math.min(1, (hours - current.minHours) / (next.minHours - current.minHours))
    : 1;
  return { current, next, progress };
}

export function subjectByKey(key: string) {
  return SUBJECTS.find((s) => s.key === key);
}

export function buildingTypeForSubject(key: string): BuildingType {
  return subjectByKey(key)?.building ?? 'temple';
}

export function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
