import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PyqTopic } from '../db';
import { Card, Button } from '../components/ui';
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer, YAxis, BarChart, Bar, Cell, CartesianGrid, Area } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { SubjectTag } from '../components/SubjectTag';
import { resolveSubjectColor } from '../utils/subjectColors';
import { calculateStreaks, formatMinutesHuman, getCompletedMinutesByDay, getCompletedMinutesBySubject, getPastNDaysTimeSeries } from '../utils/studyStats';

export default function Dashboard() {
  const navigate = useNavigate();
  const sessions = useLiveQuery(() => db.studySessions.toArray()) ?? [];
  const plannerSlots = useLiveQuery(() => db.plannerSlots.toArray()) ?? [];
  const subjects = useLiveQuery(() => db.subjects.toArray()) ?? [];
  const pyqTopics = useLiveQuery(() => db.pyqTopics.toArray()) ?? [];

  const now = new Date();
  const completedMinutesByDay = getCompletedMinutesByDay(plannerSlots, sessions);
  const completedMinutesBySubject = getCompletedMinutesBySubject(plannerSlots, sessions);

  // --- Streak Engine ---
  const { currentStreak, longestStreak } = calculateStreaks(completedMinutesByDay, now);

  // --- Daily Hours Chart Data ---
  const chartData = getPastNDaysTimeSeries(completedMinutesByDay, 14, now);
  const hasTrajectoryData = chartData.some(day => day.minutes > 0);

  const avgHours = chartData.length ? chartData.reduce((acc, day) => acc + day.hours, 0) / chartData.length : 0;
  const chartDataWithBaseline = chartData.map(d => ({ ...d, baseline: Number(avgHours.toFixed(2)) }));

  const CustomTooltip = ({ active, payload, label }: any) => {
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

  const subjectById = new Map(subjects.map(subject => [subject.id!, subject]));

  
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

      {/* Algorithmic Engine */}
      <div>
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: 500 }}>Target Acquisition Matrix</h3>
        {finalRecommendations.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
            {finalRecommendations.map(rec => {
              const subject = subjectById.get(rec.topic.subjectId);
              const subjectColor = resolveSubjectColor(subject);

              return (
              <Card
                key={rec.topic.id}
                className="clickable"
                style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: `4px solid ${subjectColor}` }}
                onClick={() => navigate('/timer')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: rec.priority >= 8 ? 'var(--danger-color)' : 'var(--text-primary)' }}>
                    [{rec.action}]
                  </span>
                  <span className="text-secondary" style={{ fontSize: '0.75rem' }}>PRIORITY {rec.priority}</span>
                </div>
                {subject && <SubjectTag name={subject.name} color={subject.color} />}
                <h4 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0.25rem 0' }}>{rec.topic.name}</h4>
                <p className="text-muted" style={{ fontSize: '0.875rem', margin: 0, fontStyle: 'italic' }}>{rec.reason}</p>

                <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
                  <Button variant="secondary" style={{ width: '100%', padding: '0.4rem', fontSize: '0.875rem' }}>Push to Timer</Button>
                </div>
              </Card>
            )})}
          </div>
        ) : (
          <Card style={{ padding: '2rem', textAlign: 'center' }}>
            <p className="text-secondary">Start by adding your first subject</p>
          </Card>
        )}
      </div>

      {/* Subject Distribution */}
      <Card>
        <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem', fontWeight: 500 }}>Subject-wise Study Hours</h3>
        {subjectHoursData.length > 0 ? (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={subjectHoursData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                <XAxis type="number" stroke="rgba(255,255,255,0.6)" tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis dataKey="subject" type="category" width={120} stroke="rgba(255,255,255,0.6)" tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'var(--surface-hover)' }} contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: '#fff', fontSize: 13 }} formatter={(value: any) => formatMinutesHuman(Math.round(Number(value ?? 0) * 60))} />
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
