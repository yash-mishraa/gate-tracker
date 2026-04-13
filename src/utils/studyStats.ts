import { format, subDays } from 'date-fns';
import type { PlannerSlot, StudySession } from '../db';

export const formatMinutesHuman = (totalMinutes: number, long = false) => {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (long) {
    if (hours === 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    if (minutes === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
    return `${hours} hour${hours === 1 ? '' : 's'} ${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

export const getSlotDurationMinutes = (slot: Pick<PlannerSlot, 'date' | 'startTime' | 'endTime'>) => {
  const start = new Date(`${slot.date}T${slot.startTime}:00`).getTime();
  const end = new Date(`${slot.date}T${slot.endTime}:00`).getTime();
  return Math.max(1, Math.round((end - start) / 60000));
};

export const getCompletedMinutesByDay = (plannerSlots: PlannerSlot[], sessions: StudySession[]) => {
  const sessionById = new Map(sessions.map(s => [s.id!, s]));
  const minutesByDay = new Map<string, number>();

  plannerSlots.forEach(slot => {
    if (!slot.completed) return;
    const linked = slot.linkedSessionId ? sessionById.get(slot.linkedSessionId) : undefined;
    const duration = linked?.durationMinutes ?? getSlotDurationMinutes(slot);
    minutesByDay.set(slot.date, (minutesByDay.get(slot.date) ?? 0) + duration);
  });

  return minutesByDay;
};

export const getCompletedMinutesBySubject = (plannerSlots: PlannerSlot[], sessions: StudySession[]) => {
  const sessionById = new Map(sessions.map(s => [s.id!, s]));
  const minutesBySubject = new Map<number, number>();

  plannerSlots.forEach(slot => {
    if (!slot.completed) return;
    const linked = slot.linkedSessionId ? sessionById.get(slot.linkedSessionId) : undefined;
    const duration = linked?.durationMinutes ?? getSlotDurationMinutes(slot);
    minutesBySubject.set(slot.subjectId, (minutesBySubject.get(slot.subjectId) ?? 0) + duration);
  });

  return minutesBySubject;
};

export const getPastNDaysTimeSeries = (
  minutesByDay: Map<string, number>,
  days: number,
  now = new Date()
) => {
  return Array.from({ length: days }).map((_, idx) => {
    const day = subDays(now, days - 1 - idx);
    const key = format(day, 'yyyy-MM-dd');
    const dayMinutes = minutesByDay.get(key) ?? 0;
    return {
      date: format(day, 'MMM dd'),
      dayKey: key,
      minutes: dayMinutes,
      hours: Number((dayMinutes / 60).toFixed(2))
    };
  });
};

export const calculateStreaks = (minutesByDay: Map<string, number>, now = new Date()) => {
  let currentStreak = 0;
  let longestStreak = 0;
  let running = 0;

  for (let i = 0; i < 365; i++) {
    const day = subDays(now, i);
    const key = format(day, 'yyyy-MM-dd');
    const isActive = (minutesByDay.get(key) ?? 0) > 0;

    if (i === 0) {
      if (isActive) {
        currentStreak = 1;
        running = 1;
        longestStreak = 1;
      }
      continue;
    }

    if (isActive) {
      running += 1;
      if (i === currentStreak) {
        currentStreak = running;
      }
      if (running > longestStreak) longestStreak = running;
    } else {
      running = 0;
    }
  }

  return { currentStreak, longestStreak };
};
