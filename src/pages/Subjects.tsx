import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Topic } from '../db';
import { Card, Button, Select } from '../components/ui';
import { Trash2, Plus, ChevronDown, ChevronUp, BookOpen, IterationCcw } from 'lucide-react';

export default function Subjects() {
  const subjects = useLiveQuery(() => db.subjects.toArray(), []) || [];
  const topics = useLiveQuery(() => db.topics.toArray(), []) || [];
  const pyqTopics = useLiveQuery(() => db.pyqTopics.toArray(), []) || [];
  const studySessions = useLiveQuery(() => db.studySessions.toArray(), []) || [];

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [bulkInput, setBulkInput] = useState('');
  const [sortBy, setSortBy] = useState<'status' | 'strength' | 'progress'>('status');

  const deriveStrength = (topic: Topic) => {
    const topicSessions = studySessions.filter(s => s.topicId === topic.id);
    const practiceQ = topic.questionsSolved + topicSessions.reduce((acc, curr) => acc + curr.questionsSolved, 0);
    const revisions = topic.revisionCount + topicSessions.filter(s => s.type === 'revision').length;
    const matchingPyq = pyqTopics.find(p => p.name.toLowerCase().includes(topic.name.toLowerCase()));
    const pyqCompletion = matchingPyq ? (matchingPyq.attemptedQuestions / matchingPyq.totalQuestions) : 0;

    if (practiceQ === 0 && revisions === 0 && pyqCompletion === 0) return 'Weak';
    if (revisions >= 3 || (practiceQ >= 50 && pyqCompletion >= 0.8)) return 'Strong';
    if (revisions >= 1 || practiceQ >= 20 || pyqCompletion >= 0.4) return 'Average';
    return 'Weak';
  };

  const getSortedTopics = (subjectId: number) => {
    let subs = topics.filter(t => t.subjectId === subjectId);
    if (sortBy === 'status') {
      const order = { 'Completed': 1, 'In Progress': 2, 'Not Started': 3 };
      subs.sort((a,b) => order[a.status] - order[b.status]);
    } else if (sortBy === 'strength') {
      const order = { 'Strong': 1, 'Average': 2, 'Weak': 3 };
      subs.sort((a,b) => order[deriveStrength(a)] - order[deriveStrength(b)]);
    } else if (sortBy === 'progress') {
      subs.sort((a,b) => (b.questionsSolved + b.revisionCount * 10) - (a.questionsSolved + a.revisionCount * 10));
    }
    return subs;
  };

  const handleBulkAdd = async (subjectId: number) => {
    if (!bulkInput.trim()) return;
    const lines = bulkInput.split('\n').map(l => l.trim()).filter(l => l);
    
    await db.transaction('rw', db.topics, async () => {
      for (const line of lines) {
        await db.topics.add({
          subjectId,
          name: line,
          status: 'Not Started',
          questionsSolved: 0,
          revisionCount: 0,
          difficulty: 'Medium'
        });
      }
    });
    setBulkInput('');
  };

  const updateTopic = async (id: number, changes: Partial<Topic>) => {
    await db.topics.update(id, changes);
  };

  const quickAction = async (id: number, field: 'questionsSolved' | 'revisionCount', current: number) => {
    await db.topics.update(id, { [field]: current + 1 });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>Subjects & Core Tracker</h1>
        <p className="text-secondary">Drill down into subjects to bulk-add and track specific topics.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {subjects.map(subject => {
          const isExpanded = expandedId === subject.id;
          const subjectTopics = getSortedTopics(subject.id!);
          const progressPerc = subjectTopics.length > 0 
            ? (subjectTopics.filter(t => t.status === 'Completed').length / subjectTopics.length) * 100 
            : 0;

          return (
            <div key={subject.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <Card 
                className="clickable"
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  borderLeft: progressPerc === 100 ? '4px solid var(--success-color)' : '4px solid var(--border-color)',
                  padding: '1.5rem'
                }}
                onClick={() => setExpandedId(isExpanded ? null : subject.id!)}
              >
                <div>
                  <h3 style={{ fontSize: '1.25rem' }}>{subject.name}</h3>
                  <div className="text-secondary" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {subjectTopics.length} Topics • {Math.round(progressPerc)}% Complete
                  </div>
                </div>
                <Button variant="ghost">{isExpanded ? <ChevronUp /> : <ChevronDown />}</Button>
              </Card>

              {isExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0 1rem 1.5rem', borderLeft: '2px solid var(--border-color)', marginLeft: '1rem' }}>
                  
                  {/* Topic Controls */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ flex: 1, minWidth: '300px' }}>
                      <textarea 
                        className="ui-input" 
                        rows={3} 
                        placeholder="Bulk add topics (one per line)..."
                        value={bulkInput}
                        onChange={e => setBulkInput(e.target.value)}
                        style={{ resize: 'vertical', width: '100%', marginBottom: '0.5rem' }}
                      />
                      <Button onClick={() => handleBulkAdd(subject.id!)} disabled={!bulkInput.trim()}><Plus size={16}/> Add Topics</Button>
                    </div>

                    <div style={{ minWidth: '200px' }}>
                      <label className="text-secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>Sort By</label>
                      <Select value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
                        <option value="status">Lifecycle Status</option>
                        <option value="strength">Detected Strength</option>
                        <option value="progress">Questions Solved</option>
                      </Select>
                    </div>
                  </div>

                  {/* Topic List */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                    {subjectTopics.map(topic => {
                      const strength = deriveStrength(topic);
                      const strengthColor = strength === 'Strong' ? 'var(--success-color)' : strength === 'Average' ? 'var(--warning-color)' : 'var(--danger-color)';

                      return (
                        <Card key={topic.id} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontWeight: 600 }}>{topic.name}</div>
                            <Button variant="ghost" style={{ padding: '0.25rem', color: 'var(--danger-color)' }} onClick={() => db.topics.delete(topic.id!)}>
                              <Trash2 size={16}/>
                            </Button>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Select 
                              value={topic.status} 
                              onChange={(e) => updateTopic(topic.id!, { status: e.target.value as any })}
                              style={{ flex: 1, fontSize: '0.75rem', padding: '0.4rem', border: topic.status === 'Completed' ? '1px solid var(--success-color)' : '1px solid var(--border-color)'}}
                            >
                              <option value="Not Started">Not Started</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Completed">Completed</option>
                            </Select>
                            
                            <div title="Derived Strength" style={{ padding: '0.4rem 0.6rem', borderRadius: '4px', border: `1px solid ${strengthColor}40`, color: strengthColor, fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                              {strength}
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Button variant="secondary" onClick={() => quickAction(topic.id!, 'questionsSolved', topic.questionsSolved)} style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem' }}>
                              <BookOpen size={14}/> +1 Qs ({topic.questionsSolved})
                            </Button>
                            <Button variant="secondary" onClick={() => quickAction(topic.id!, 'revisionCount', topic.revisionCount)} style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem' }}>
                              <IterationCcw size={14}/> +1 Rev ({topic.revisionCount})
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                    {subjectTopics.length === 0 && <div className="text-muted" style={{ padding: '1rem 0' }}>No topics added yet.</div>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
