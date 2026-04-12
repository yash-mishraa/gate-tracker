import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PyqTopic } from '../db';
import { Card, Button } from '../components/ui';
import { format, subDays, isSameDay, eachDayOfInterval } from 'date-fns';
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer, YAxis } from 'recharts';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const navigate = useNavigate();
  const sessions = useLiveQuery(() => db.studySessions.toArray()) ?? [];
  const subjects = useLiveQuery(() => db.subjects.toArray()) ?? [];
  const pyqTopics = useLiveQuery(() => db.pyqTopics.toArray()) ?? [];

  const now = new Date();

  // --- Streak Engine ---
  let currentStreak = 0;
  let maxStreak = 0;
  let tempStreak = 0;

  // We look back over a whole year to accurately calculate historical max streak
  for (let i = 0; i < 365; i++) {
    const d = subDays(now, i);
    const hasSess = sessions.some(s => isSameDay(new Date(s.startTime), d));

    // For current streak
    if (i === 0 && !hasSess) {
      // It's today, we might just not have studied yet. Don't break current streak, but tempStreak stays 0 unless yesterday had one
      continue;
    }

    if (hasSess) {
      tempStreak++;
      if (currentStreak === i - 1 || (i === 0)) currentStreak = tempStreak;
      if (tempStreak > maxStreak) maxStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }

  // --- Daily Hours Chart Data ---
  const last14Days = eachDayOfInterval({ start: subDays(now, 13), end: now });
  const chartData = last14Days.map(d => {
    const daySessions = sessions.filter(s => isSameDay(new Date(s.startTime), d));
    const hours = daySessions.reduce((acc, s) => acc + s.durationMinutes, 0) / 60;
    return {
      date: format(d, 'MMM dd'),
      hours: Number(hours.toFixed(1))
    };
  });
  const avgHours = chartData.length ? chartData.reduce((acc, day) => acc + day.hours, 0) / chartData.length : 0;
  const chartDataWithBaseline = chartData.map(d => ({ ...d, baseline: Number(avgHours.toFixed(1)) }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ backgroundColor: '#1A1A1A', border: '1px solid var(--border-color)', padding: '0.75rem', borderRadius: '4px', color: '#fff', fontSize: '0.875rem' }}>
          <p style={{ margin: 0, fontWeight: 600, marginBottom: '0.25rem' }}>{label}</p>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Focused: <span style={{ color: 'var(--text-primary)' }}>{payload[0].value} hrs</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // --- AI Recommendation Engine ---
  const threeDaysMs = 3 * 86400000;
  const sevenDaysMs = 7 * 86400000;
  const fourteenDaysMs = 14 * 86400000;

  const deriveStrength = (t: PyqTopic) => {
    const progress = t.attemptedQuestions / t.totalQuestions;
    const accuracy = t.attemptedQuestions === 0 ? 0 : t.correctQuestions / t.attemptedQuestions;
    if (progress < 0.4 || accuracy < 0.6 || (t.totalQuestions > 10 && t.attemptedQuestions < 5)) return 'Weak';
    if (progress > 0.8 && accuracy >= 0.8) return 'Strong';
    return 'Average';
  };

  const getStatusOfTopic = (t: PyqTopic) => {
    if (t.attemptedQuestions === 0) return 'Not Started';
    if (t.attemptedQuestions === t.totalQuestions) return 'Completed';
    return 'In Progress';
  };

  const recommendations: { topic: PyqTopic, priority: number, action: string, reason: string }[] = [];

  pyqTopics.forEach(topic => {
    const strength = deriveStrength(topic);
    const status = getStatusOfTopic(topic);
    const timeSinceUpdate = now.getTime() - (topic.lastUpdated || 0);

    // Dynamic Revision Thresholds
    let needsRevision = false;
    let revReason = '';
    if (strength === 'Weak' && timeSinceUpdate > threeDaysMs) {
      needsRevision = true;
      revReason = `Weak topic untouched for ${Math.floor(timeSinceUpdate / 86400000)} days.`;
    } else if (strength === 'Average' && timeSinceUpdate > sevenDaysMs) {
      needsRevision = true;
      revReason = `Average topic degrading, untouched for ${Math.floor(timeSinceUpdate / 86400000)} days.`;
    } else if (strength === 'Strong' && timeSinceUpdate > fourteenDaysMs) {
      needsRevision = true;
      revReason = `Strong topic scheduled for spaced interval (14 days).`;
    }

    if (needsRevision) {
      recommendations.push({ topic, priority: 5, action: 'Revise', reason: revReason });
    } else {
      // What to study next logic
      if (status === 'In Progress' && strength === 'Weak') {
        recommendations.push({ topic, priority: 10, action: 'Focus Next', reason: 'High-yield: Weak area currently in progress.' });
      } else if (status === 'Not Started' && strength === 'Weak') {
        recommendations.push({ topic, priority: 8, action: 'Start Solving', reason: 'Critical: Completely untouched weak area.' });
      } else if (status === 'In Progress' && strength === 'Average') {
        recommendations.push({ topic, priority: 6, action: 'Continue', reason: 'Maintain momentum on this average topic.' });
      }
    }
  });

  // Deduplicate: If multiple exist for same topic, keep the one with higher priority
  const dedupedMap = new Map<number, (typeof recommendations)[0]>();
  recommendations.forEach(r => {
    const existing = dedupedMap.get(r.topic.id!);
    if (!existing || existing.priority < r.priority) {
      dedupedMap.set(r.topic.id!, r);
    }
  });

  const finalRecommendations = Array.from(dedupedMap.values())
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3); // Max 3 cards

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
          <div style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--color-green)' }}>{maxStreak} <span style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Days</span></div>
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
          <ResponsiveContainer>
            <LineChart data={chartDataWithBaseline}>
              <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} dy={10} />
              <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border-color)', strokeWidth: 1, strokeDasharray: '5 5' }} />
              <Line
                type="monotone"
                dataKey="hours"
                stroke="var(--text-primary)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--bg-color)', strokeWidth: 2 }}
                activeDot={{ r: 5, fill: 'var(--text-primary)' }}
              />
              <Line
                type="monotone"
                dataKey="baseline"
                stroke="rgba(59, 130, 246, 0.35)"
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />

            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Algorithmic Engine */}
      <div>
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: 500 }}>Target Acquisition Matrix</h3>
        {finalRecommendations.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
            {finalRecommendations.map(rec => (
              <Card
                key={rec.topic.id}
                className="clickable"
                style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
                onClick={() => navigate('/timer')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: rec.priority >= 8 ? 'var(--danger-color)' : 'var(--text-primary)' }}>
                    [{rec.action}]
                  </span>
                  <span className="text-secondary" style={{ fontSize: '0.75rem' }}>PRIORITY {rec.priority}</span>
                </div>
                <h4 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0.25rem 0' }}>{rec.topic.name}</h4>
                <p className="text-muted" style={{ fontSize: '0.875rem', margin: 0, fontStyle: 'italic' }}>{rec.reason}</p>

                <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
                  <Button variant="secondary" style={{ width: '100%', padding: '0.4rem', fontSize: '0.875rem' }}>Push to Timer</Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card style={{ padding: '2rem', textAlign: 'center' }}>
            <p className="text-secondary">Start by adding your first subject</p>
          </Card>
        )}
      </div>

      {/* Subject Distribution */}
      <Card>
        <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem', fontWeight: 500 }}>Structural Focus Ratio</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {subjects.map(sub => {
            const subjectSess = sessions.filter(s => s.subjectId === sub.id);
            const totalMins = subjectSess.reduce((acc, curr) => acc + (curr.durationMinutes || 0), 0);
            if (totalMins === 0) return null;

            // Relative comparison against strongest subject
            const maxMins = Math.max(...subjects.map(s => sessions.filter(ss => ss.subjectId === s.id).reduce((a, c) => a + c.durationMinutes, 0)));
            const focusWidth = (totalMins / maxMins) * 100;

            return (
              <div key={sub.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ fontWeight: 500 }}>{sub.name}</span>
                  <span className="text-secondary">{(totalMins / 60).toFixed(1)} hrs</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--surface-hover)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${focusWidth}%`, height: '100%', backgroundColor: 'rgba(59, 130, 246, 0.25)' }} />
                </div>
              </div>
            );
          })}
          {sessions.length === 0 && <div className="text-secondary" style={{ fontSize: '0.875rem' }}>No telemetry data captured. Boot the timer module.</div>}
        </div>
      </Card>

    </div>
  );
}
