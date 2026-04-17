import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deletePyqSubjectCascade, type PyqTopic, type PyqSubject } from '../db';
import { Card, Button, Input, ProgressBar } from '../components/ui';
import { Plus, CheckCircle, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import { SubjectTag } from '../components/SubjectTag';
import { getDeterministicSubjectColor, resolveSubjectColor } from '../utils/subjectColors';

const getPyqTopicSubjectId = (topic: PyqTopic) => topic.pyqSubjectId ?? topic.subjectId;

export default function PYQTracker() {
  const subjects = useLiveQuery(() => db.pyqSubjects.toArray(), []) || [];
  const pyqTopics = useLiveQuery(() => db.pyqTopics.toArray(), []) || [];
  
  const [newSubjectName, setNewSubjectName] = useState('');
  const [bulkTopicInputs, setBulkTopicInputs] = useState<Record<number, string>>({});
  const [editingTopic, setEditingTopic] = useState<{ id: number, name: string, total: string, attempted?: string, revisions?: string } | null>(null);
  const [expandedSubjectId, setExpandedSubjectId] = useState<number | null>(null);
  const [editingSubject, setEditingSubject] = useState<{ id: number; name: string; color: string }>({ id: 0, name: '', color: '#0ea5e9' });
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);

  // --- Core Analytics Computations ---
  const totalAttempted = pyqTopics.reduce((a, t) => a + t.attemptedQuestions, 0);
  const totalRevisionsDone = pyqTopics.reduce((a, t) => a + (t.revisionCount || 0), 0);
  const totalQuestionsPool = pyqTopics.reduce((a, t) => a + t.totalQuestions, 0);

  const deriveStrength = (t: PyqTopic) => {
    const progress = t.attemptedQuestions / t.totalQuestions;
    const revisions = t.revisionCount || 0;
    
    if (progress < 0.4 || (t.attemptedQuestions > 0 && revisions === 0) || (t.totalQuestions > 10 && t.attemptedQuestions < 5)) return 'Weak';
    if (progress > 0.8 && revisions >= 2) return 'Strong';

    return 'Average';
  };

  const getTopicProgress = (t: PyqTopic) => t.attemptedQuestions / t.totalQuestions;

  const weakTopicsCount = pyqTopics.filter(t => deriveStrength(t) === 'Weak').length;


  // --- Handlers ---
  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    
    const existing = subjects.find(s => s.name.toLowerCase() === newSubjectName.trim().toLowerCase());
    
    if (!existing) {
      const normalizedName = newSubjectName.trim();
      await db.pyqSubjects.add({
        name: normalizedName,
        color: getDeterministicSubjectColor(normalizedName),
        createdAt: Date.now(),
        lastUpdated: Date.now()
      });
    }
    
    setNewSubjectName('');
  };

  const handleBulkAddPyqTopics = async (subjectId: number) => {
    const input = bulkTopicInputs[subjectId];
    if (!input || !input.trim()) return;

    const lines = input.split(/[\n,]+/).map(l => l.trim()).filter(Boolean);
    
    await db.transaction('rw', db.pyqTopics, async () => {
      for (const line of lines) {
        const match = line.match(/(.+?)\s+(\d+)$/);
        let name = line;
        let total = 50;
        
        if (match) {
          name = match[1].trim();
          const parsed = parseInt(match[2], 10);
          if (parsed > 0) total = parsed;
        }

        const existing = (await db.pyqTopics
          .where('pyqSubjectId')
          .equals(subjectId)
          .filter(topic => topic.name.toLowerCase() === name.toLowerCase())
          .first())
          || (await db.pyqTopics
            .toArray()
            .then(topics => topics.find(topic =>
              topic.pyqSubjectId == null &&
              topic.subjectId === subjectId &&
              topic.name.toLowerCase() === name.toLowerCase()
            )));
        if (!existing) {
          await db.pyqTopics.add({
            pyqSubjectId: subjectId,
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

    const beginEditSubject = (subject: PyqSubject) => {
    setEditingSubjectId(subject.id || null);
    setEditingSubject({
      id: subject.id!,
      name: subject.name,
      color: subject.color || getDeterministicSubjectColor(subject.name)
    });
  };

  const saveSubjectEdits = async () => {
    if (!editingSubjectId) return;
    const normalizedName = editingSubject.name.trim();
    if (!normalizedName) {
      alert('Subject name cannot be empty.');
      return;
    }

    const duplicate = subjects.find(
      subject =>
        subject.id !== editingSubjectId &&
        subject.name.toLowerCase() === normalizedName.toLowerCase()
    );
    if (duplicate) {
      alert('A subject with this name already exists.');
      return;
    }

    await db.pyqSubjects.update(editingSubjectId, {
      name: normalizedName,
      color: editingSubject.color || getDeterministicSubjectColor(normalizedName),
      lastUpdated: Date.now()
    });
    setEditingSubjectId(null);
  };

  const deleteSubject = async (subjectId: number) => {
    const confirmed = confirm('Delete this subject? This will remove all its subtopics and progress.');
    if (!confirmed) return;
    await deletePyqSubjectCascade(subjectId);
    if (expandedSubjectId === subjectId) setExpandedSubjectId(null);
    if (editingSubjectId === subjectId) setEditingSubjectId(null);
  };


  const updateStats = async (topicId: number, mode: 'att-inc' | 'att-dec' | 'rev-inc' | 'rev-dec') => {
    await db.transaction('rw', db.pyqTopics, async () => {
      const current = await db.pyqTopics.get(topicId);
      if (!current) return;

      let att = current.attemptedQuestions;
      let cor = current.correctQuestions;
      let rev = current.revisionCount || 0;

      switch (mode) {
        case 'att-inc':
          if (att < current.totalQuestions) att++;
          break;
        case 'att-dec':
          att = Math.max(0, att - 1);
          cor = Math.min(cor, att);
          break;
        case 'rev-inc':
          rev++;
          break;
        case 'rev-dec':
          rev = Math.max(0, rev - 1);
          break;
      }

    // Retained for backward compatibility in stored records.
      cor = Math.min(cor, att);

    await db.pyqTopics.update(topicId, {
        attemptedQuestions: att,
        correctQuestions: cor,
        revisionCount: rev,
        lastUpdated: Date.now()
      });

    });
  };

  const saveEdits = async () => {
    if (!editingTopic) return;
    const parsedTotal = parseInt(editingTopic.total, 10);
    const parsedAtt = parseInt((editingTopic as any).attempted, 10) || 0;
    const parsedRev = parseInt((editingTopic as any).revisions, 10) || 0;

    if (!parsedTotal || parsedTotal <= 0) {
      alert("Total questions must be greater than 0");
      return;
    }

    if (parsedAtt > parsedTotal || parsedAtt < 0 || parsedRev < 0) {
      alert("Invalid matrix configuration variables.");
      return;
    }

    const existing = await db.pyqTopics.get(editingTopic.id);
    if (!existing) return;

    await db.pyqTopics.update(editingTopic.id, {
      name: editingTopic.name,
      totalQuestions: parsedTotal,
      attemptedQuestions: parsedAtt,
      correctQuestions: Math.min(existing.correctQuestions, parsedAtt),
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
           <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>Total Revisions Done</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>
              {totalRevisionsDone}
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
            const sTopics = pyqTopics.filter(t => getPyqTopicSubjectId(t) === subject.id);

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
            const isExpanded = expandedSubjectId === subject.id;
            const isEditingSubject = editingSubjectId === subject.id;

            return (
              <Card
                key={subject.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '1.5rem 2rem',
                  borderLeft: `4px solid ${subjectColor}`
                }}
              >
                {/* Subject Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    {isEditingSubject ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', gap: '0.5rem', alignItems: 'center' }}>
                        <Input
                          value={editingSubject.name}
                          onChange={e => setEditingSubject(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Subject name"
                        />
                        <Input
                          type="color"
                          value={editingSubject.color}
                          onChange={e => setEditingSubject(prev => ({ ...prev, color: e.target.value }))}
                          title="Subject color"
                          style={{ minWidth: '2.5rem', width: '2.75rem', height: '2.3rem', padding: '0.2rem' }}
                        />
                        <Button onClick={saveSubjectEdits} style={{ whiteSpace: 'nowrap' }}>Save</Button>
                        <Button variant="ghost" onClick={() => setEditingSubjectId(null)} style={{ whiteSpace: 'nowrap' }}>Cancel</Button>
                      </div>
                    ) : (
                      <>
                        <h2 style={{ fontSize: '1.5rem' }}>
                          <SubjectTag name={subject.name} color={subject.color} />
                        </h2>
                        <span className="text-secondary" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                          {Math.round(subjProgress)}% Matrix Complete
                        </span>
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {!isEditingSubject && (
                      <>
                        <Button
                          variant="ghost"
                          style={{ padding: '0.45rem' }}
                          onClick={() => beginEditSubject(subject)}
                          aria-label={`Edit ${subject.name}`}
                          title="Edit subject"
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          style={{ padding: '0.45rem', color: 'var(--color-red)' }}
                          onClick={() => deleteSubject(subject.id!)}
                          aria-label={`Delete ${subject.name}`}
                          title="Delete subject"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      style={{ padding: '0.5rem' }}
                      onClick={() => setExpandedSubjectId(isExpanded ? null : subject.id!)}
                      aria-label={isExpanded ? `Collapse ${subject.name}` : `Expand ${subject.name}`}
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </Button>
                  </div>
                </div>

                <ProgressBar progress={subjProgress} tone="green" />

                {/* Expandable Content */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateRows: isExpanded ? '1fr' : '0fr',
                    opacity: isExpanded ? 1 : 0,
                    transition: 'grid-template-rows 180ms ease, opacity 180ms ease',
                    marginTop: isExpanded ? '1.5rem' : '0'
                  }}
                >
                  <div style={{ overflow: 'hidden' }}>

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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                      {sTopics.map(topic => {
                        const isCompleted = topic.attemptedQuestions === topic.totalQuestions;
            
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
                                <Input
                                  value={editingTopic?.name || ''}
                                  onChange={e => editingTopic && setEditingTopic({...editingTopic, name: e.target.value})}
                                  placeholder="Topic Name"
                                />
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0.5rem' }}>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={(editingTopic as any)?.attempted ?? ''}
                                    onChange={e => editingTopic && setEditingTopic({...editingTopic, attempted: e.target.value})}
                                    placeholder="Attempts"
                                  />
                                  <Input
                                    type="number"
                                    min="0"
                                    value={(editingTopic as any)?.revisions ?? ''}
                                    onChange={e => editingTopic && setEditingTopic({...editingTopic, revisions: e.target.value})}
                                    placeholder="Revisions"
                                  />
                                  <Input
                                    type="number"
                                    min="1"
                                    value={editingTopic?.total || ''}
                                    onChange={e => editingTopic && setEditingTopic({...editingTopic, total: e.target.value})}
                                    placeholder="Total Qs"
                                  />
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
                                    {isCompleted && (
                                      <CheckCircle
                                        size={14}
                                        style={{ color: 'var(--success-color)', display: 'inline', marginLeft: '0.5rem', marginBottom: '-2px' }}
                                      />
                                    )}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    style={{ padding: '0 0.2rem', fontSize: '0.75rem' }}
                                    onClick={() => setEditingTopic({
                                      id: topic.id!,
                                      name: topic.name,
                                      total: String(topic.totalQuestions),
                                      attempted: String(topic.attemptedQuestions),
                                      revisions: String(topic.revisionCount || 0)
                                    } as any)}
                                  >
                                    Edit
                                  </Button>
                                </div>

                                <div className="text-secondary" style={{ fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Attempted: <span style={{ color: 'var(--text-primary)' }}>{topic.attemptedQuestions}</span> / {topic.totalQuestions}</span>
                                  <span>Revisions: <span style={{ color: 'var(--text-primary)' }}>{topic.revisionCount || 0}</span></span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <Button variant="secondary" onClick={() => updateStats(topic.id!, 'att-inc')} disabled={isCompleted} style={{ padding: '0.2rem', fontSize: '0.75rem' }}>+1 Att</Button>
                                    <Button variant="ghost" onClick={() => updateStats(topic.id!, 'att-dec')} style={{ padding: '0.2rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>-1</Button>

                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <Button variant="secondary" onClick={() => updateStats(topic.id!, 'rev-inc')} style={{ padding: '0.2rem', fontSize: '0.75rem' }}>+1 Rev ({topic.revisionCount || 0})</Button>
                                    <Button variant="ghost" onClick={() => updateStats(topic.id!, 'rev-dec')} style={{ padding: '0.2rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>-1</Button>
                                  </div>
                                  </div>
                              </>
                            )}
                          </Card>
                        );
                      })}
                    </div> {/* end subtopic grid */}

                  </div> {/* end overflow:hidden */}
                </div> {/* end grid-template-rows */}

              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}