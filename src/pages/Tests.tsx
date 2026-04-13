import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Card, Button, Input, Select } from '../components/ui';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, Tooltip, YAxis, Cell, Legend } from 'recharts';
import { format, differenceInDays } from 'date-fns';
import { Target, TrendingUp, TrendingDown, Clock, Trash2, Plus } from 'lucide-react';


const getMaxMarks = (test: { maxMarks?: number; totalMarks: number }) => test.maxMarks ?? test.totalMarks;
const getMarksObtained = (test: { marksObtained?: number; obtainedMarks: number }) => test.marksObtained ?? test.obtainedMarks;


export default function Tests() {
  const subjects = useLiveQuery(() => db.subjects.toArray()) ?? [];
  const tests = useLiveQuery(() => db.tests.toArray()) ?? [];
  const testSubjects = useLiveQuery(() => db.testSubjects.toArray()) ?? [];

  const [showAddModal, setShowAddModal] = useState(false);
  const [newTestName, setNewTestName] = useState('');
  const [newMaxMarks, setNewMaxMarks] = useState('');
  const [newMarksObtained, setNewMarksObtained] = useState('');

  const [newTestMins, setNewTestMins] = useState('');
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAddModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [subjectInputs, setSubjectInputs] = useState<{ subjectId: number, obtained: string, total: string }[]>([]);

  const handleAddSubjectField = () => {
    setSubjectInputs([...subjectInputs, { subjectId: subjects[0]?.id || 0, obtained: '', total: '' }]);
  };

  const updateSubjectField = (index: number, field: string, value: string | number) => {
    const updated = [...subjectInputs];
    (updated[index] as any)[field] = value;
    setSubjectInputs(updated);
  };

  const removeSubjectField = (index: number) => {
    setSubjectInputs(subjectInputs.filter((_, i) => i !== index));
  };

  const handleSaveTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTestName || !newMaxMarks || !newTestMins) return;

    const totalFromSubjectRows = subjectInputs.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const obtainedFromSubjectRows = subjectInputs.reduce((sum, row) => sum + Number(row.obtained || 0), 0);

    const maxMarks = Math.max(Number(newMaxMarks), totalFromSubjectRows || 0);
    const marksObtained = newMarksObtained
      ? Number(newMarksObtained)
      : Math.min(maxMarks, obtainedFromSubjectRows);

    const testId = await db.tests.add({
      name: newTestName,
      date: Date.now(),
      totalMarks: maxMarks,
      obtainedMarks: marksObtained,
      maxMarks,
      marksObtained,
      timeTaken: Number(newTestMins)
    });

    for (const sub of subjectInputs) {
      if (sub.subjectId && sub.obtained && sub.total) {
        await db.testSubjects.add({
          testId: testId as number,
          subjectId: sub.subjectId,
          marksObtained: Number(sub.obtained),
          totalMarks: Number(sub.total)
        });
      }
    }

    setShowAddModal(false);
    setNewTestName('');
    setNewMaxMarks('');
    setNewMarksObtained('');
    setNewTestMins('');
    setSubjectInputs([]);
  };

  const deleteTest = async (id?: number) => {
    if (!id) return;
    if (confirm('Delete this test and all its subject-wise analytics?')) {
      await db.tests.delete(id);
      const linkedSubjects = testSubjects.filter(ts => ts.testId === id);
      for (const ts of linkedSubjects) {
        if (ts.id) await db.testSubjects.delete(ts.id);
      }
    }
  };

  const sortedTests = [...tests].sort((a, b) => a.date - b.date);
  const trendData = sortedTests.map(test => {
    const maxMarks = getMaxMarks(test);
    const marksObtained = getMarksObtained(test);
    return {
      name: test.name,
      dateLabel: format(test.date, 'MMM dd'),
      scorePercentage: maxMarks > 0 ? Number(((marksObtained / maxMarks) * 100).toFixed(1)) : 0,
      marksObtained,
      maxMarks
    };
  });

  const latestTest = sortedTests[sortedTests.length - 1];
  const daysSinceLastTest = latestTest ? differenceInDays(new Date(), new Date(latestTest.date)) : null;
  const bestScore = trendData.length > 0 ? Math.max(...trendData.map(t => t.scorePercentage)) : 0;

  const movingAverageData = trendData.map((point, idx) => {
    const window = trendData.slice(Math.max(0, idx - 2), idx + 1);
    const movingAvg = window.reduce((sum, item) => sum + item.scorePercentage, 0) / window.length;
    return { ...point, movingAvg: Number(movingAvg.toFixed(1)) };
  });

  let trendDirection: 'improving' | 'declining' | 'steady' = 'steady';
  if (movingAverageData.length >= 4) {
    const latestWindow = movingAverageData.slice(-2);
    const previousWindow = movingAverageData.slice(-4, -2);
    const latestAvg = latestWindow.reduce((sum, item) => sum + item.movingAvg, 0) / latestWindow.length;
    const previousAvg = previousWindow.reduce((sum, item) => sum + item.movingAvg, 0) / previousWindow.length;
    if (latestAvg > previousAvg + 2) trendDirection = 'improving';
    if (latestAvg < previousAvg - 2) trendDirection = 'declining';
  }

  const subjectAggregatesMap = new Map<number, { ob: number, tot: number }>();
  testSubjects.forEach(ts => {
    const existing = subjectAggregatesMap.get(ts.subjectId) || { ob: 0, tot: 0 };
    subjectAggregatesMap.set(ts.subjectId, { ob: existing.ob + ts.marksObtained, tot: existing.tot + ts.totalMarks });
  });

  const subjectChartData = Array.from(subjectAggregatesMap.entries()).map(([subId, data]) => {
    const subject = subjects.find(s => s.id === subId);

    return {
      subjectId: subId,
      subject: subject?.name || 'Unknown',
      accuracy: data.tot > 0 ? Math.round((data.ob / data.tot) * 100) : 0,
      color: subject?.color || 'var(--accent-color)'
    };
  }).sort((a, b) => b.accuracy - a.accuracy);

  const CustomLineTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ backgroundColor: '#1A1A1A', border: '1px solid var(--border-color)', padding: '0.75rem', borderRadius: '4px', color: '#fff', fontSize: '0.875rem' }}>
          <p style={{ margin: 0, fontWeight: 600, marginBottom: '0.25rem' }}>{label}</p>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Score: <span style={{ color: 'var(--text-primary)' }}>{payload[0].value}%</span></p>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Moving Avg: <span style={{ color: 'var(--text-primary)' }}>{payload[1].value}%</span></p>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>Mock Test Control</h1>
          <p className="text-secondary">Track highest-fidelity performance metrics across complete diagnostic runs.</p>
        </div>
        <Button onClick={() => setShowAddModal(!showAddModal)} className="ui-btn-primary"><Plus size={18} style={{ marginRight: '0.5rem' }} /> Log Test</Button>
      </div>

      {showAddModal && (
        <Card style={{ backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 600 }}>Create Analytical Log</h3>
          <form onSubmit={handleSaveTest} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
              <div>
                <label className="text-secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.5rem' }}>Test Designation *</label>
                <Input value={newTestName} onChange={e => setNewTestName(e.target.value)} placeholder="e.g. Full Mock 1" required autoFocus />
              </div>
              <div>
                <label className="text-secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.5rem' }}>Max Marks *</label>
                <Input type="number" min="1" value={newMaxMarks} onChange={e => setNewMaxMarks(e.target.value)} placeholder="e.g. 100" required />
              </div>
              <div>
                <label className="text-secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.5rem' }}>Marks Obtained</label>
                <Input type="number" min="0" value={newMarksObtained} onChange={e => setNewMarksObtained(e.target.value)} placeholder="Auto from rows" />
              </div>
              <div>
                <label className="text-secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.5rem' }}>Execution Mins *</label>
                <Input type="number" min="1" value={newTestMins} onChange={e => setNewTestMins(e.target.value)} placeholder="e.g. 180" required />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 500 }}>Structural Breakdown</h4>
                <Button type="button" variant="secondary" onClick={handleAddSubjectField} style={{ padding: '0.2rem 0.5rem', fontSize: '0.875rem' }}><Plus size={14} /> Add Subject</Button>
              </div>

              {subjectInputs.map((subInput, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                  <Select value={subInput.subjectId} onChange={e => updateSubjectField(idx, 'subjectId', Number(e.target.value))}>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                  <Input type="number" min="0" placeholder="Obtained" value={subInput.obtained} onChange={e => updateSubjectField(idx, 'obtained', e.target.value)} required />
                  <Input type="number" min="1" placeholder="Total" value={subInput.total} onChange={e => updateSubjectField(idx, 'total', e.target.value)} required />
                  <Button type="button" variant="ghost" onClick={() => removeSubjectField(idx)} style={{ color: 'var(--danger-color)', padding: '0.5rem' }}><Trash2 size={16} /></Button>
                </div>
              ))}
              {subjectInputs.length === 0 && <p className="text-muted" style={{ fontSize: '0.875rem', fontStyle: 'italic' }}>No granular subject breakdown attached. Overall marks still tracked.</p>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
              <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button type="submit" className="ui-btn-primary">Commit Diagnostics</Button>
            </div>
          </form>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <Card style={{ padding: '1.5rem', borderColor: trendDirection === 'improving' ? 'var(--success-color)' : trendDirection === 'declining' ? 'var(--danger-color)' : 'transparent' }}>
          <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>Consistency Indicator</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.5rem', fontWeight: 600, color: trendDirection === 'improving' ? 'var(--success-color)' : trendDirection === 'declining' ? 'var(--danger-color)' : 'var(--text-primary)' }}>
            {trendDirection === 'improving' && <TrendingUp size={24} />}
            {trendDirection === 'declining' && <TrendingDown size={24} />}
            {trendDirection === 'steady' && <Target size={24} className="text-secondary" />}
            <span style={{ textTransform: 'capitalize' }}>{trendDirection}</span>
          </div>
          <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.4rem' }}>Based on rolling 3-test moving average.</div>
        </Card>
        
        <Card style={{ padding: '1.5rem' }}>
          <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>Test Frequency Gap</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{daysSinceLastTest !== null ? daysSinceLastTest : '-'} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Days Ago</span></div>
        </Card>

        <Card style={{ padding: '1.5rem' }}>
          <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>Absolute Apex Accuracy</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{Math.round(bestScore)} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>%</span></div>
        </Card>
      </div>

      {tests.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
          <Card>
            <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem', fontWeight: 500 }}>Score Trend</h3>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={movingAverageData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="dateLabel" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip content={<CustomLineTooltip />} cursor={{ fill: 'transparent' }} />
                  <Line type="monotone" dataKey="scorePercentage" name="Score %" stroke="var(--text-primary)" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: 'var(--bg-color)' }} activeDot={{ r: 5, fill: 'var(--text-primary)' }} />
                  <Line type="monotone" dataKey="movingAvg" name="Moving Avg" stroke="var(--text-secondary)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              </div>
          </Card>

          <Card>
            <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem', fontWeight: 500 }}>Marks Comparison</h3>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'var(--surface-hover)' }} />
                  <Legend />
                  <Bar dataKey="marksObtained" name="Marks Obtained" maxBarSize={32} radius={[4, 4, 0, 0]} fill="var(--text-primary)" />
                  <Bar dataKey="maxMarks" name="Max Marks" maxBarSize={32} radius={[4, 4, 0, 0]} fill="var(--text-muted)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {subjectChartData.length > 0 && (
            <Card>
              <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem', fontWeight: 500 }}>Subject Accuracy Mix</h3>
              <div style={{ width: '100%', height: 250 }}>
                <ResponsiveContainer>
                  <BarChart data={subjectChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <XAxis dataKey="subject" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'var(--surface-hover)' }} />
                    <Bar dataKey="accuracy" radius={[4, 4, 0, 0]} maxBarSize={40}>
                      {subjectChartData.map((entry) => (
                        <Cell key={entry.subjectId} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </div>
      ) : (
        <Card style={{ padding: '3rem', textAlign: 'center' }}>
          <Clock size={40} className="text-muted" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>No Tests Found</h3>
          <p className="text-secondary" style={{ maxWidth: '400px', margin: '0 auto' }}>Start by logging your first test</p>
        </Card>
      )}

      {tests.length > 0 && (
        <Card>
          <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem', fontWeight: 500 }}>Historical Database</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[...sortedTests].reverse().map((test) => {
              const maxMarks = getMaxMarks(test);
              const marksObtained = getMarksObtained(test);
              const scorePercentage = maxMarks > 0 ? Math.round((marksObtained / maxMarks) * 100) : 0;

              return (
                <div key={test.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>{test.name}</div>
                    <div className="text-secondary" style={{ fontSize: '0.75rem' }}>{format(test.date, 'MMMM do, yyyy')} • {test.timeTaken} mins</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{marksObtained} <span className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 500 }}>/ {maxMarks}</span></div>
                      <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Score</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--success-color)' }}>{scorePercentage}<span style={{ fontSize: '0.75rem' }}>%</span></div>
                      <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Accuracy</div>
                    </div>
                 <Button variant="ghost" style={{ padding: '0.5rem', color: 'var(--danger-color)' }} onClick={() => deleteTest(test.id)}><Trash2 size={16} /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
