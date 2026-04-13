import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PyqTopic, type Subject } from '../db';
import { Card } from '../components/ui';
import { AlertTriangle, Clock, Target, Ghost, TrendingUp, Gauge, CalendarCheck } from 'lucide-react';
import { isSameDay, startOfWeek, subDays, format, eachDayOfInterval } from 'date-fns';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LineChart, Line } from 'recharts';

const minutesToLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

export default function Analytics() {
  const subjects: Subject[] = useLiveQuery(() => db.subjects.toArray()) ?? [];
  const pyqTopics: PyqTopic[] = useLiveQuery(() => db.pyqTopics.toArray()) ?? [];
  const studySessions = useLiveQuery(() => db.studySessions.toArray()) ?? [];
  const plannerSlots = useLiveQuery(() => db.plannerSlots.toArray()) ?? [];

  const now = new Date();
  const nowMs = now.getTime();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });

  const sessions = [...studySessions].sort((a, b) => a.startTime - b.startTime);
  const sessionCount = sessions.length;
  const confidenceLow = sessionCount < 5;

  const todayMinutes = sessions.filter(s => isSameDay(new Date(s.startTime), now)).reduce((sum, s) => sum + s.durationMinutes, 0);
  const weekMinutes = sessions.filter(s => s.startTime >= weekStart.getTime()).reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  const hourBuckets = Array(24).fill(0);
  sessions.forEach(session => {
    hourBuckets[new Date(session.startTime).getHours()] += session.durationMinutes;
  });
  const maxBucketMinutes = Math.max(...hourBuckets, 0);
  const peakHour = hourBuckets.indexOf(maxBucketMinutes);
  const peakFocus = maxBucketMinutes > 0
    ? `${format(new Date(0, 0, 0, peakHour), 'h a')}–${format(new Date(0, 0, 0, (peakHour + 2) % 24), 'h a')}`
    : 'Not enough timing data';

  const subjectMinutes = subjects.map(subject => {
    const mins = sessions.filter(s => s.subjectId === subject.id).reduce((sum, s) => sum + s.durationMinutes, 0);
    return { ...subject, minutes: mins };
});

  const subjectHoursData = subjectMinutes
    .filter(subject => subject.minutes > 0)
    .map(subject => ({
      id: subject.id,
      subject: subject.name,
      hours: Number((subject.minutes / 60).toFixed(1)),
      share: totalMinutes > 0 ? ((subject.minutes / totalMinutes) * 100).toFixed(1) : '0.0',
      color: subject.color || 'var(--accent-color)'
    }))
    .sort((a, b) => b.hours - a.hours);

  const trendDays = eachDayOfInterval({ start: subDays(now, 29), end: now });
  const timeTrendData = trendDays.map(day => {
    const dayMinutes = sessions.filter(s => isSameDay(new Date(s.startTime), day)).reduce((sum, s) => sum + s.durationMinutes, 0);
    return {
      date: format(day, 'MMM dd'),
      hours: Number((dayMinutes / 60).toFixed(1))
    };
  });

  const tenDaysMs = 10 * 86400000;
  const ignoredSubject = subjectMinutes
    .map(subject => {
      const lastSessionTime = sessions.filter(s => s.subjectId === subject.id).reduce((max, s) => Math.max(max, s.endTime), 0);
      return { ...subject, lastSessionTime };
    })
    .filter(subject => subject.lastSessionTime > 0 && (nowMs - subject.lastSessionTime) > tenDaysMs)
    .sort((a, b) => a.lastSessionTime - b.lastSessionTime)[0];

  const firstDay = sessions[0] ? new Date(sessions[0].startTime) : now;
  const daysTracked = Math.max(1, Math.ceil((nowMs - firstDay.getTime()) / 86400000) + 1);
  const activeDays = new Set(sessions.map(s => new Date(s.startTime).toDateString())).size;
  const consistencyScore = Math.round((activeDays / daysTracked) * 100);

  const avgSessionMinutes = sessionCount ? Math.round(totalMinutes / sessionCount) : 0;
  const last14Days = Array.from({ length: 14 }).map((_, idx) => subDays(now, 13 - idx));
  const sessionsPerDay = last14Days.map(day => sessions.filter(s => isSameDay(new Date(s.startTime), day)).length);
  const avgSessionsPerDay = sessionsPerDay.length
    ? Number((sessionsPerDay.reduce((sum, n) => sum + n, 0) / sessionsPerDay.length).toFixed(1))
    : 0;

  const eveningSessions = sessions.filter(s => new Date(s.startTime).getHours() >= 18).length;
  const shortSessions = sessions.filter(s => s.durationMinutes < 30).length;
  const focusWarnings: string[] = [];
  if (sessionCount > 0 && eveningSessions / sessionCount < 0.15) {
    focusWarnings.push('You avoid studying after 6 PM.');
  }
  if (sessionCount > 0 && shortSessions / sessionCount > 0.6) {
    focusWarnings.push('Most sessions are under 30 minutes.');
  }
  if (focusWarnings.length === 0) {
    focusWarnings.push('Your session distribution looks balanced right now.');
  }
  const getSlotDurationMinutes = (slot: { date: string; startTime: string; endTime: string }) => {
    const start = new Date(`${slot.date}T${slot.startTime}:00`).getTime();
    const end = new Date(`${slot.date}T${slot.endTime}:00`).getTime();
    return Math.max(1, Math.round((end - start) / 60000));
  };

  const totalPlannedMinutes = plannerSlots.reduce((sum, slot) => sum + getSlotDurationMinutes(slot), 0);
  const totalStudiedMinutes = plannerSlots.reduce((sum, slot) => {
    if (!slot.completed) return sum;
    const linked = slot.linkedSessionId ? sessions.find(session => session.id === slot.linkedSessionId) : undefined;
    return sum + (linked?.durationMinutes ?? getSlotDurationMinutes(slot));
  }, 0);
  const efficiency = totalPlannedMinutes > 0 ? Math.round((totalStudiedMinutes / totalPlannedMinutes) * 100) : 0;

  const pyqAttempts = pyqTopics.reduce((sum, topic) => sum + topic.attemptedQuestions, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>Deep Analytics</h1>
        <p className="text-secondary">AI-driven extraction of your behavioral patterns.</p>
        {confidenceLow && (
          <div style={{ marginTop: '0.75rem', display: 'inline-flex', gap: '0.4rem', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '999px', padding: '0.2rem 0.7rem', fontSize: '0.8rem' }}>
            <AlertTriangle size={14} />
            Low Confidence ({sessionCount}/5 sessions)
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        
        <Card style={{ borderTop: '4px solid var(--accent-color)' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Clock className="text-secondary" />
            <div>
              <div className="text-secondary" style={{ fontSize: '0.875rem' }}>Total Study Time</div>
              <div style={{ fontWeight: 600 }}>Today: {minutesToLabel(todayMinutes)}</div>
              <div style={{ fontWeight: 600 }}>This week: {minutesToLabel(weekMinutes)}</div>
              <div style={{ fontWeight: 600 }}>Overall: {minutesToLabel(totalMinutes)}</div>
            </div>
          </div>
        </Card>

        <Card style={{ borderTop: '4px solid var(--color-blue)' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Target className="text-secondary" />
            <div>
              <div className="text-secondary" style={{ fontSize: '0.875rem' }}>Peak Focus</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{peakFocus}</div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>{minutesToLabel(maxBucketMinutes)} logged in your strongest hour bucket.</div>
            </div>
          </div>
        </Card>

        <Card style={{ borderTop: '4px solid var(--text-muted)' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Ghost className="text-secondary" />
            <div>
              <div className="text-secondary" style={{ fontSize: '0.875rem' }}>Most Ignored Subject</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{ignoredSubject?.name ?? 'None detected'}</div>
              {ignoredSubject && (
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                  Inactive for {Math.floor((nowMs - ignoredSubject.lastSessionTime) / 86400000)} days.
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card style={{ borderTop: '4px solid var(--success-color)' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <CalendarCheck className="text-secondary" />
            <div>
              <div className="text-secondary" style={{ fontSize: '0.875rem' }}>Consistency Score</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{consistencyScore}%</div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>{activeDays} active day(s) in {daysTracked} tracked day(s).</div>
            </div>
          </div>
        </Card>

        <Card style={{ borderTop: '4px solid var(--warning-color)' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <TrendingUp className="text-secondary" />
            <div>
              <div className="text-secondary" style={{ fontSize: '0.875rem' }}>Session Trends</div>
              <div>Avg session: <strong>{minutesToLabel(avgSessionMinutes)}</strong></div>
              <div>Sessions/day (14d): <strong>{avgSessionsPerDay}</strong></div>
            </div>
          </div>
        </Card>

        <Card style={{ borderTop: '4px solid var(--danger-color)' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Gauge className="text-secondary" />
            <div>
              <div className="text-secondary" style={{ fontSize: '0.875rem' }}>Planner Efficiency</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{efficiency}%</div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>Planned: {minutesToLabel(totalPlannedMinutes)} • Studied: {minutesToLabel(totalStudiedMinutes)}</div>
          </div>
        </div>
      </Card>
    </div>

      <Card>
       <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: 500 }}>Study Time Trend (Last 30 Days)</h3>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={timeTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ stroke: 'var(--border-color)', strokeWidth: 1 }} />
              <Line type="monotone" dataKey="hours" stroke="var(--text-primary)" strokeWidth={2} dot={{ r: 2, fill: 'var(--text-primary)' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

<Card>
  <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: 500 }}>Subject-wise Total Hours Studied</h3>
        {subjectHoursData.length > 0 ? (
          <>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={subjectHoursData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <XAxis type="number" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis dataKey="subject" type="category" width={140} stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'var(--surface-hover)' }} />
                  <Bar dataKey="hours" maxBarSize={26} radius={[0, 4, 4, 0]}>
                    {subjectHoursData.map(item => (
                      <Cell key={item.id} fill={item.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.8rem' }}>
              {subjectHoursData.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span>{item.subject} — {item.hours}h</span>
                  <span className="text-muted">{item.share}%</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-secondary">No study sessions logged yet.</p>
        )}
      </Card>


      <Card>
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: 500 }}>Weak Focus Pattern Detection</h3>
        <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {focusWarnings.map((warning, idx) => (
            <li key={idx}>{warning}</li>
          ))}
          <li>PYQ attempts tracked: {pyqAttempts}</li>
          <li>Total planned hours: {(totalPlannedMinutes / 60).toFixed(1)}h</li>
          <li>Total studied hours: {(totalStudiedMinutes / 60).toFixed(1)}h</li>
          <li>Efficiency: {efficiency}%</li>
        </ul>
      </Card>
    </div>
  );
}
