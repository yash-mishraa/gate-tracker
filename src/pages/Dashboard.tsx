import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Card } from '../components/ui';
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer, YAxis, BarChart, Bar, Cell, CartesianGrid, Area } from 'recharts';
import { resolveSubjectColor } from '../utils/subjectColors';
import { calculateStreaks, formatMinutesHuman, getCompletedMinutesByDay, getCompletedMinutesBySubject, getPastNDaysTimeSeries } from '../utils/studyStats';

const GATE_TARGET_DATE = new Date('2027-02-07T00:00:00');
const GATE_TIMELINE_START = new Date('2026-02-07T00:00:00');

// ✅ Fix 3: Moved outside component to prevent "cannot create components during render" error
interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (active && payload && payload.length) {
    const value = Number(payload[0]?.value ?? 0);
    return (
      <div style={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.15)', padding: '0.75rem 0.9rem', borderRadius: '10px', color: '#fff', fontSize: '13px' }}>
        <p style={{ margin: 0, fontWeight: 600, marginBottom: '0.25rem', color: 'rgba(255,255,255,0.9)' }}>{label}</p>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.95)', fontWeight: 700 }}>
          Focused: {formatMinutesHuman(Math.round(value * 60))}
        </p>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const sessions = useLiveQuery(() => db.studySessions.toArray()) ?? [];
  const plannerSlots = useLiveQuery(() => db.plannerSlots.toArray()) ?? [];
  const subjects = useLiveQuery(() => db.subjects.toArray()) ?? [];
  const pyqTopics = useLiveQuery(() => db.pyqTopics.toArray()) ?? [];
  const [today, setToday] = useState(() => new Date());
  const [clockTime, setClockTime] = useState(() => new Date());

  useEffect(() => {
    const refreshDay = () => setToday(new Date());
    refreshDay();
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    let dayInterval: ReturnType<typeof setInterval> | undefined;
    const dayTimeout = setTimeout(() => {
      refreshDay();
      dayInterval = setInterval(refreshDay, 24 * 60 * 60 * 1000);
    }, nextMidnight.getTime() - now.getTime());
    return () => {
      clearTimeout(dayTimeout);
      if (dayInterval) clearInterval(dayInterval);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setClockTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const completedMinutesByDay = getCompletedMinutesByDay(plannerSlots, sessions);
  const completedMinutesBySubject = getCompletedMinutesBySubject(plannerSlots, sessions);
  const { currentStreak, longestStreak } = calculateStreaks(completedMinutesByDay, today);
  const chartData = getPastNDaysTimeSeries(completedMinutesByDay, 14, today);
  const hasTrajectoryData = chartData.some(day => day.minutes > 0);
  const avgHours = chartData.length ? chartData.reduce((acc, day) => acc + day.hours, 0) / chartData.length : 0;
  const chartDataWithBaseline = chartData.map(d => ({ ...d, baseline: Number(avgHours.toFixed(2)) }));

  const subjectHoursData = subjects
    .map(sub => {
      const minutes = completedMinutesBySubject.get(sub.id!) ?? 0;
      return {
        id: sub.id,
        subject: sub.name,
        hours: Number((minutes / 60).toFixed(1)),
        color: resolveSubjectColor(sub)
      };
    })
    .filter(item => item.hours > 0)
    .sort((a, b) => b.hours - a.hours);

  // ✅ Fix 1: Removed useMemo wrappers — React Compiler handles memoization automatically
  const daysLeft = (() => {
    const diffTime = GATE_TARGET_DATE.getTime() - today.getTime();
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  })();

  const countdownProgress = (() => {
    const totalWindow = GATE_TARGET_DATE.getTime() - GATE_TIMELINE_START.getTime();
    const elapsed = today.getTime() - GATE_TIMELINE_START.getTime();
    return Math.min(100, Math.max(0, (elapsed / totalWindow) * 100));
  })();

  const calendarData = (() => {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const leadingBlankDays = monthStart.getDay();
    const totalDays = monthEnd.getDate();

    const cells: Array<{ day: number | null; key: string; dateKey?: string; isToday?: boolean; hasActivity?: boolean }> = [];

    for (let i = 0; i < leadingBlankDays; i += 1) {
      cells.push({ day: null, key: `blank-start-${i}` });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(today.getFullYear(), today.getMonth(), day);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = day === today.getDate();
      const hasActivity = (completedMinutesByDay.get(dateKey) ?? 0) > 0;
      cells.push({ day, key: dateKey, dateKey, isToday, hasActivity });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ day: null, key: `blank-end-${cells.length}` });
    }

    return {
      monthLabel: today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      cells
    };
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>Command Center</h1>
        <p className="text-secondary">Overview of your preparation vector and algorithmic trajectory.</p>
      </div>

      {/* Top Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <Card>
          <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>Longest Streak</div>
          <div style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--color-green)' }}>{longestStreak} <span style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Days</span></div>
        </Card>
        <Card>
          <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>Current Streak</div>
          <div style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--color-blue)' }}>{currentStreak} <span style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Days</span></div>
        </Card>
        <Card>
          <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>Total Mastered PYQs</div>
          <div style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--color-amber)' }}>{pyqTopics.reduce((a, c) => a + c.correctQuestions, 0)}</div>
        </Card>
      </div>

      {/* Recharts Trajectory Graph */}
      <Card style={{ paddingRight: '2rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem', fontWeight: 500 }}>Execution Trajectory (Past 14 Days)</h3>
        <div style={{ width: '100%', height: 250 }}>
          {hasTrajectoryData ? (
            <ResponsiveContainer>
              <LineChart data={chartDataWithBaseline} margin={{ top: 12, right: 18, left: 6, bottom: 8 }}>
                <defs>
                  <linearGradient id="dashboardTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.14)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.6)" tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 12 }} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="rgba(255,255,255,0.6)" tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Area type="monotone" dataKey="hours" fill="url(#dashboardTrendFill)" stroke="none" />
                <Line
                  type="monotone"
                  dataKey="hours"
                  stroke="rgba(255,255,255,0.95)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 6, fill: '#fff', stroke: 'rgba(255,255,255,0.25)', strokeWidth: 8 }}
                />
                <Line type="monotone" dataKey="baseline" stroke="rgba(59,130,246,0.45)" strokeWidth={2} dot={false} activeDot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-secondary" style={{ fontSize: '0.875rem', padding: '1rem' }}>No study data available yet</div>
          )}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        <Card style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <p className="text-secondary" style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Gate Countdown</p>
          <div style={{ fontSize: '2.1rem', fontWeight: 600, letterSpacing: '-0.03em', color: 'rgba(255,255,255,0.96)', lineHeight: 1.1 }}>{daysLeft} Days Left</div>
          <p className="text-secondary" style={{ fontSize: '0.9rem' }}>until GATE 2027</p>
          <div style={{ marginTop: '0.25rem' }}>
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${countdownProgress.toFixed(2)}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, rgba(59,130,246,0.42), rgba(255,255,255,0.42))',
                  transition: 'width 0.45s ease'
                }}
              />
            </div>
            <p className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>{countdownProgress.toFixed(1)}% timeline elapsed</p>
          </div>
        </Card>

        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <p className="text-secondary" style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.9rem' }}>Live Clock</p>
            <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, monospace', fontSize: '2.05rem', letterSpacing: '0.06em', fontWeight: 600, color: 'rgba(255,255,255,0.95)', textShadow: '0 0 18px rgba(255,255,255,0.08)' }}>
              {clockTime.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>
          <p className="text-muted" style={{ marginTop: '0.8rem', fontSize: '0.8rem' }}>
            {clockTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </Card>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 500 }}>Calendar</h3>
          <p className="text-secondary" style={{ fontSize: '0.85rem' }}>{calendarData.monthLabel}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '0.35rem', marginBottom: '0.5rem' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(dayLabel => (
            <div key={dayLabel} className="text-muted" style={{ fontSize: '0.75rem', textAlign: 'center', paddingBottom: '0.35rem' }}>{dayLabel}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '0.35rem' }}>
          {calendarData.cells.map(cell => (
            <div
              key={cell.key}
              style={{
                minHeight: 38,
                borderRadius: 8,
                border: cell.isToday ? '1px solid rgba(255,255,255,0.55)' : '1px solid transparent',
                background: cell.isToday ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: cell.day ? 'var(--text-primary)' : 'transparent',
                position: 'relative',
                transition: 'all 0.25s ease'
              }}
            >
              {cell.day ?? ''}
              {cell.hasActivity && !cell.isToday && (
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: 'rgba(59,130,246,0.75)',
                    position: 'absolute',
                    bottom: 6
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </Card>

           <Card>
        <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem', fontWeight: 500 }}>Subject-wise Study Hours</h3>
        {subjectHoursData.length > 0 ? (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={subjectHoursData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                <XAxis type="number" stroke="rgba(255,255,255,0.6)" tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis dataKey="subject" type="category" width={120} stroke="rgba(255,255,255,0.6)" tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-hover)' }}
                  contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: '#fff', fontSize: 13 }}
                  labelStyle={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, marginBottom: '0.25rem' }}
                  itemStyle={{ color: 'rgba(255,255,255,0.95)', fontWeight: 700 }}
                  formatter={(value: number) => [formatMinutesHuman(Math.round(value * 60)), 'Focused']}
                />
                <Bar dataKey="hours" radius={[0, 4, 4, 0]} maxBarSize={26}>
                  {subjectHoursData.map(item => (
                    <Cell key={item.id} fill={item.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-secondary" style={{ fontSize: '0.875rem' }}>No telemetry data captured. Boot the timer module.</div>
        )}
      </Card>

    </div>
  );
}