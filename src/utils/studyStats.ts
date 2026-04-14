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
      hours: dayMinutes / 60
    };
  });
};

export const calculateStreaks = (minutesByDay: Map<string, number>, now = new Date()) => {
  const activeDateKeys = [...minutesByDay.entries()]
    .filter(([, minutes]) => minutes > 0)
    .map(([key]) => key)
    .sort();


  if (activeDateKeys.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  const activeDateSet = new Set(activeDateKeys);
  const todayKey = format(now, 'yyyy-MM-dd');
  const yesterdayKey = format(subDays(now, 1), 'yyyy-MM-dd');
  const streakStartKey = activeDateSet.has(todayKey)
    ? todayKey
    : activeDateSet.has(yesterdayKey)
      ? yesterdayKey
      : '';

  let currentStreak = 0;
  if (streakStartKey) {
    for (let offset = 0; ; offset += 1) {
      const key = format(subDays(new Date(`${streakStartKey}T00:00:00`), offset), 'yyyy-MM-dd');
      if (!activeDateSet.has(key)) break;
      currentStreak += 1;

    }
  }

  let longestStreak = 0;
  let runningStreak = 0;
  let previousDate: Date | null = null;
  activeDateKeys.forEach(key => {
    const currentDate = new Date(`${key}T00:00:00`);
    if (!previousDate) {
      runningStreak = 1;

    } else {
      const prevPlusOne = new Date(previousDate);
      prevPlusOne.setDate(prevPlusOne.getDate() + 1);
      runningStreak = format(prevPlusOne, 'yyyy-MM-dd') === key ? runningStreak + 1 : 1;

    }
  
    longestStreak = Math.max(longestStreak, runningStreak);
    previousDate = currentDate;
  });


  return { currentStreak, longestStreak };
};
