import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PyqTopic } from '../db';
import { Card, Button, Input, ProgressBar } from '../components/ui';
import { Plus, CheckCircle } from 'lucide-react';
import { SubjectTag } from '../components/SubjectTag';
import { getDeterministicSubjectColor, resolveSubjectColor } from '../utils/subjectColors';


export default function PYQTracker() {
  const subjects = useLiveQuery(() => db.subjects.toArray(), []) || [];
  const pyqTopics = useLiveQuery(() => db.pyqTopics.toArray(), []) || [];
  
  const [newSubjectName, setNewSubjectName] = useState('');
  const [bulkTopicInputs, setBulkTopicInputs] = useState<Record<number, string>>({});
  const [editingTopic, setEditingTopic] = useState<{ id: number, name: string, total: string, attempted?: string, correct?: string, revisions?: string } | null>(null);

  // --- Core Analytics Computations ---
  const totalAttempted = pyqTopics.reduce((a, t) => a + t.attemptedQuestions, 0);
  const totalCorrect = pyqTopics.reduce((a, t) => a + t.correctQuestions, 0);
  const totalQuestionsPool = pyqTopics.reduce((a, t) => a + t.totalQuestions, 0);
  const overallAccuracy = totalAttempted === 0 ? 0 : Math.round((totalCorrect / totalAttempted) * 100);

  const deriveStrength = (t: PyqTopic) => {
    const progress = t.attemptedQuestions / t.totalQuestions;
    const accuracy = t.attemptedQuestions === 0 ? 0 : t.correctQuestions / t.attemptedQuestions;
    
    if (progress < 0.4 || accuracy < 0.6 || (t.totalQuestions > 10 && t.attemptedQuestions < 5)) return 'Weak';
    if (progress > 0.8 && accuracy >= 0.8) return 'Strong';
    return 'Average';
  };

  const getTopicProgress = (t: PyqTopic) => t.attemptedQuestions / t.totalQuestions;

  const weakTopicsCount = pyqTopics.filter(t => deriveStrength(t) === 'Weak').length;
  const getAccuracyColor = (accuracy: number) => {
    if (accuracy < 40) return 'var(--color-red)';
    if (accuracy <= 70) return 'var(--color-amber)';
    return 'var(--color-green)';
  };


  // --- Handlers ---
  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    
    const existing = subjects.find(s => s.name.toLowerCase() === newSubjectName.trim().toLowerCase());
    
    if (!existing) {
      const normalizedName = newSubjectName.trim();
      await db.subjects.add({ name: normalizedName, color: getDeterministicSubjectColor(normalizedName) });
    }
    
    setNewSubjectName('');
  };

  const handleBulkAddPyqTopics = async (subjectId: number) => {
    const input = bulkTopicInputs[subjectId];
    if (!input || !input.trim()) return;

    const lines = input.split(/[\n,]+/).map(l => l.trim()).filter(Boolean);
    
    await db.transaction('rw', db.pyqTopics, async () => {
      for (const line of lines) {
        // Simple heuristic: if line ends with a number, try to treat it as total. Otherwise default to 50.
        const match = line.match(/(.+?)\s+(\d+)$/);
        let name = line;
        let total = 50;
        
        if (match) {
          name = match[1].trim();
          const parsed = parseInt(match[2], 10);
          if (parsed > 0) total = parsed;
        }

        const existing = await db.pyqTopics.where({ subjectId, name }).first();
        if (!existing) {
          await db.pyqTopics.add({
            subjectId,
            name,
            totalQuestions: total,
            attemptedQuestions: 0,
            correctQuestions: 0,
            revisionCount: 0,
            lastUpdated: Date.now()
          });
        }
      }
    });

    setBulkTopicInputs(prev => ({ ...prev, [subjectId]: '' }));
  };

  const updateStats = async (topic: PyqTopic, mode: 'att-inc' | 'att-dec' | 'cor-inc' | 'cor-dec' | 'rev-inc' | 'rev-dec') => {
    let att = topic.attemptedQuestions;
    let cor = topic.correctQuestions;
    let rev = topic.revisionCount || 0;

    switch (mode) {
      case 'att-inc':
        if (att < topic.totalQuestions) att++;
        break;
      case 'att-dec':
        att = Math.max(0, att - 1);
        cor = Math.min(cor, att);
        break;
      case 'cor-inc':
        if (att < topic.totalQuestions) att++;
        cor++;
        break;
      case 'cor-dec':
        cor = Math.max(0, cor - 1);
        break;
      case 'rev-inc':
        rev++;
        break;
      case 'rev-dec':
        rev = Math.max(0, rev - 1);
        break;
    }

    // Safety final bound
    cor = Math.min(cor, att);

    await db.pyqTopics.update(topic.id!, {
      attemptedQuestions: att,
      correctQuestions: cor,
      revisionCount: rev,
      lastUpdated: Date.now()
    });
  };

  const saveEdits = async () => {
    if (!editingTopic) return;
    const parsedTotal = parseInt(editingTopic.total, 10);
    const parsedAtt = parseInt((editingTopic as any).attempted, 10) || 0;
    const parsedCor = parseInt((editingTopic as any).correct, 10) || 0;
    const parsedRev = parseInt((editingTopic as any).revisions, 10) || 0;

    if (!parsedTotal || parsedTotal <= 0) {
      alert("Total questions must be greater than 0");
      return;
    }

    if (parsedCor > parsedAtt || parsedAtt > parsedTotal || parsedCor < 0 || parsedAtt < 0 || parsedRev < 0) {
      alert("Invalid matrix configuration variables.");
      return;
    }

    await db.pyqTopics.update(editingTopic.id, {
      name: editingTopic.name,
      totalQuestions: parsedTotal,
      attemptedQuestions: parsedAtt,
      correctQuestions: parsedCor,
      revisionCount: parsedRev,
      lastUpdated: Date.now()
    });
    setEditingTopic(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Top Level Analytics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>PYQ Matrix Dashboard</h1>
          <p className="text-secondary">Track execution, derive logic, and stay exact with your attempts.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <Card>
            <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>Overall Progress</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>{totalAttempted} <span className="text-muted" style={{fontSize: '1rem'}}>/ {totalQuestionsPool}</span></div>
          </Card>
          <Card>
            <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>Global Accuracy</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 600, color: getAccuracyColor(overallAccuracy) }}>
              {overallAccuracy}%
            </div>
          </Card>
          <Card>
            <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>Weak Subtopics Detected</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 600, color: weakTopicsCount > 0 ? 'var(--color-red)' : 'var(--text-primary)' }}>
              {weakTopicsCount}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: 500 }}>Create Subject Module</h3>
        <form onSubmit={handleAddSubject} style={{ display: 'flex', gap: '1rem' }}>
          <Input 
            placeholder="Subject Name (e.g. Operating Systems)" 
            value={newSubjectName} 
            onChange={e => setNewSubjectName(e.target.value)} 
          />
          <Button type="submit"><Plus size={16}/> Initialize</Button>
        </form>
      </Card>

      {/* Grid of Subject Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {subjects.length === 0 ? (
          <Card style={{ padding: '3rem', textAlign: 'center' }}>
            <p className="text-secondary">Start by adding your first subject</p>
          </Card>
        ) : (
          subjects.map(subject => {
            let sTopics = pyqTopics.filter(t => t.subjectId === subject.id);

          // Stable Sorting: Primary(Strength), Secondary(Progress Asc)
          const strengthRank = { 'Weak': 1, 'Average': 2, 'Strong': 3 };
          sTopics.sort((a, b) => {
            const rankA = strengthRank[deriveStrength(a)];
            const rankB = strengthRank[deriveStrength(b)];
            if (rankA !== rankB) return rankA - rankB;
            return getTopicProgress(a) - getTopicProgress(b);
          });

          const subjAttempted = sTopics.reduce((acc, t) => acc + t.attemptedQuestions, 0);
          const subjTotal = sTopics.reduce((acc, t) => acc + t.totalQuestions, 0);
          const subjProgress = subjTotal === 0 ? 0 : (subjAttempted / subjTotal) * 100;
          const subjectColor = resolveSubjectColor(subject);

          return (
            <Card
              key={subject.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                padding: '1.5rem 2rem',
                borderLeft: `4px solid ${subjectColor}`
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
                  <h2 style={{ fontSize: '1.5rem' }}>
                    <SubjectTag name={subject.name} color={subject.color} />
                  </h2>
                  <span className="text-secondary" style={{ fontWeight: 600, fontSize: '0.875rem' }}>{Math.round(subjProgress)}% Matrix Complete</span>
                </div>
                <ProgressBar progress={subjProgress} tone="green" />
              </div>

              {/* Bulk Input for Subtopics */}
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <textarea 
                  className="ui-input" 
                  rows={2} 
                  placeholder="Bulk Add Subtopics (e.g., 'Binary Trees 50' or 'MST')"
                  value={bulkTopicInputs[subject.id!] || ''}
                  onChange={e => setBulkTopicInputs(prev => ({ ...prev, [subject.id!]: e.target.value }))}
                  style={{ resize: 'vertical', width: '100%' }}
                />
                <Button onClick={() => handleBulkAddPyqTopics(subject.id!)} disabled={!bulkTopicInputs[subject.id!]?.trim()}>
                  <Plus size={16}/> Build
                </Button>
              </div>

              {/* Subtopic List */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1rem' }}>
                {sTopics.map(topic => {
                  const isCompleted = topic.attemptedQuestions === topic.totalQuestions;
                  const accuracy = topic.attemptedQuestions === 0 ? 0 : Math.round((topic.correctQuestions / topic.attemptedQuestions) * 100);
                  return (
                    <Card key={topic.id} style={{ 
                      padding: '1rem', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '0.75rem',
                      opacity: isCompleted ? 0.6 : 1
                    }}>
                      {editingTopic?.id === topic.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <Input value={editingTopic?.name || ''} onChange={e => editingTopic && setEditingTopic({...editingTopic, name: e.target.value})} placeholder="Topic Name" />
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0.5rem' }}>
                            <Input type="number" min="0" value={(editingTopic as any)?.attempted ?? ''} onChange={e => editingTopic && setEditingTopic({...editingTopic, attempted: e.target.value})} placeholder="Attempts" />
                            <Input type="number" min="0" value={(editingTopic as any)?.correct ?? ''} onChange={e => editingTopic && setEditingTopic({...editingTopic, correct: e.target.value})} placeholder="Correct" />
                            <Input type="number" min="0" value={(editingTopic as any)?.revisions ?? ''} onChange={e => editingTopic && setEditingTopic({...editingTopic, revisions: e.target.value})} placeholder="Revisions" />
                            <Input type="number" min="1" value={editingTopic?.total || ''} onChange={e => editingTopic && setEditingTopic({...editingTopic, total: e.target.value})} placeholder="Total Qs" />
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Button onClick={saveEdits} style={{ flex: 1, padding: '0.2rem' }}>Save</Button>
                            <Button variant="ghost" onClick={() => setEditingTopic(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontWeight: 600, fontSize: '1rem' }}>
                              {topic.name} 
                              {isCompleted && <CheckCircle size={14} style={{ color: 'var(--success-color)', display: 'inline', marginLeft: '0.5rem', marginBottom: '-2px' }} />}
                            </div>
                            <Button variant="ghost" style={{ padding: '0 0.2rem', fontSize: '0.75rem' }} onClick={() => setEditingTopic({ id: topic.id!, name: topic.name, total: String(topic.totalQuestions), attempted: String(topic.attemptedQuestions), correct: String(topic.correctQuestions), revisions: String(topic.revisionCount || 0) } as any)}>
                              Edit
                            </Button>
                          </div>

                          <div className="text-secondary" style={{ fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Attempted: <span style={{ color: 'var(--text-primary)' }}>{topic.attemptedQuestions}</span> / {topic.totalQuestions}</span>
                            <span>Accuracy: <span style={{ color: getAccuracyColor(accuracy) }}>{accuracy}%</span></span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <Button variant="secondary" onClick={() => updateStats(topic, 'att-inc')} disabled={isCompleted} style={{ padding: '0.2rem', fontSize: '0.75rem' }}>+1 Att</Button>
                              <Button variant="ghost" onClick={() => updateStats(topic, 'att-dec')} style={{ padding: '0.2rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>-1</Button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <Button variant="secondary" onClick={() => updateStats(topic, 'cor-inc')} disabled={isCompleted} style={{ padding: '0.2rem', fontSize: '0.75rem' }}>+1 Cor</Button>
                              <Button variant="ghost" onClick={() => updateStats(topic, 'cor-dec')} style={{ padding: '0.2rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>-1</Button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <Button variant="secondary" onClick={() => updateStats(topic, 'rev-inc')} style={{ padding: '0.2rem', fontSize: '0.75rem' }}>+1 Rev ({topic.revisionCount || 0})</Button>
                              <Button variant="ghost" onClick={() => updateStats(topic, 'rev-dec')} style={{ padding: '0.2rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>-1</Button>
                            </div>
                          </div>
                        </>
                      )}
                    </Card>
                  );
                })}
              </div>

            </Card>
          );
        }))}
      </div>

    </div>
  );
}
