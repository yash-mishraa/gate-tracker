import { db } from '../db';
import { getDeterministicSubjectColor } from './subjectColors';

export async function ensureSubjectColors() {
  const subjects = await db.subjects.toArray();
  const updates = subjects
    .filter(subject => !subject.color)
    .map(subject => ({
      key: subject.id!,
      changes: { color: getDeterministicSubjectColor(subject.name) }
    }));

  if (updates.length > 0) {
    await db.subjects.bulkUpdate(updates);
  }
}
