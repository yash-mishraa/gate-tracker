import type { Subject } from '../db';

export const SUBJECT_COLOR_PALETTE = [
  '#3B82F6',
  '#22C55E',
  '#F59E0B',
  '#8B5CF6',
  '#06B6D4',
  '#F43F5E'
] as const;

export const FALLBACK_SUBJECT_COLOR = '#3B82F6';

export function getColorIndex(name: string, len: number) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % len;
}

export function getDeterministicSubjectColor(name: string) {
  return SUBJECT_COLOR_PALETTE[getColorIndex(name, SUBJECT_COLOR_PALETTE.length)] || FALLBACK_SUBJECT_COLOR;
}

export function resolveSubjectColor(subject?: Pick<Subject, 'name' | 'color'>) {
  if (!subject) return FALLBACK_SUBJECT_COLOR;
  return subject.color || getDeterministicSubjectColor(subject.name) || FALLBACK_SUBJECT_COLOR;
}
