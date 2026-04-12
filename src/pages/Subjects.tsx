import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Topic } from '../db';
import { Card, Button, Input } from '../components/ui';
import { Trash2, Plus, ChevronDown, ChevronUp, Calendar, CheckSquare } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { SubjectTag } from '../components/SubjectTag';
import { resolveSubjectColor } from '../utils/subjectColors';

export default function Subjects() {
  const subjects = useLiveQuery(() => db.subjects.toArray(), []) || [];
  const topics = useLiveQuery(() => db.topics.toArray(), []) || [];

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [bulkInput, setBulkInput] = useState('');
  const [editingDatesId, setEditingDatesId] = useState<number | null>(null);

  const handleBulkAdd = async (subjectId: number) => {
    if (!bulkInput.trim()) return;
    const lines = bulkInput.split('\n').map(l => l.trim()).filter(Boolean);
    
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

  const toggleTopic = async (topic: Topic) => {
    const isCompleted = topic.status === 'Completed';
    await db.topics.update(topic.id!, { 
      status: isCompleted ? 'Not Started' : 'Completed'
    });
  };

  const markAll = async (subjectId: number, complete: boolean) => {
    const sTopics = topics.filter(t => t.subjectId === subjectId);
    await db.transaction('rw', db.topics, async () => {
      for (const t of sTopics) {
        await db.topics.update(t.id!, { status: complete ? 'Completed' : 'Not Started' });
      }
    });
  };

  const handleDeleteSubject = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm("Delete Subject? This will cascade and delete EVERYTHING including PYQs and logs linked to it.")) {
      await db.transaction('rw', db.subjects, db.topics, db.pyqTopics, async () => {
        await db.subjects.delete(id);
        const tIds = topics.filter(t => t.subjectId === id).map(t => t.id!);
        await db.topics.bulkDelete(tIds);
        
        const matchingPyq = await db.pyqTopics.where({ subjectId: id }).primaryKeys();
        await db.pyqTopics.bulkDelete(matchingPyq as number[]);
      });
    }
  };

  const handleDateUpdate = async (id: number, startStr: string, endStr: string) => {
    let start = startStr ? parseISO(startStr).getTime() : undefined;
    let end = endStr ? parseISO(endStr).getTime() : undefined;

    if (start && end && start > end) {
      alert("Start date cannot be after end date.");
      return;
    }
    // Single date fallback
    if (start && !end) end = start;
    if (end && !start) start = end;

    await db.subjects.update(id, { startDate: start, endDate: end, lastUpdated: Date.now() });
    setEditingDatesId(null);
  };

  const clearDates = async (id: number) => {
    // using raw update to delete keys isn't perfect, but overwriting with undefined works
    await db.subjects.update(id, { Object: undefined } as any); // hack bypass for TS
    const sb = await db.subjects.get(id);
    if(sb) {
       delete sb.startDate;
       delete sb.endDate;
       await db.subjects.put(sb);
    }
    setEditingDatesId(null);
  };

  const formatTimestamp = (ts?: number) => {
    if (!ts) return "";
    return format(new Date(ts), 'yyyy-MM-dd');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>Core Modules</h1>
        <p className="text-secondary">Structure your macro-timelines and simple task matrices natively.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {subjects.length === 0 ? (
          <Card style={{ padding: '3rem', textAlign: 'center' }}>
            <p className="text-secondary">Start by adding your first subject on the Tracking View.</p>
          </Card>
        ) : (
          subjects.map(subject => {
            const isExpanded = expandedId === subject.id;
            const subjectTopics = topics.filter(t => t.subjectId === subject.id);
            const completedCount = subjectTopics.filter(t => t.status === 'Completed').length;
            const progressPerc = subjectTopics.length > 0 ? (completedCount / subjectTopics.length) * 100 : 0;
            const subjectColor = resolveSubjectColor(subject);
            const isEditingDates = editingDatesId === subject.id;
            
            let timelineLabel = "No timeline set";
            if (subject.startDate && subject.endDate) {
               if (subject.startDate === subject.endDate) {
                 timelineLabel = format(subject.startDate, 'MMM d');
               } else {
                 timelineLabel = `${format(subject.startDate, 'MMM d')} → ${format(subject.endDate, 'MMM d')}`;
               }
            }

            return (
              <div key={subject.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <Card 
                  className="clickable"
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    borderLeft: `4px solid ${subjectColor}`,
                    padding: '1.5rem'
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : subject.id!)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <SubjectTag name={subject.name} color={subject.color} />
                      </h3>
                      <div className="text-secondary" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                        {subjectTopics.length} Topics • {Math.round(progressPerc)}% Complete
                      </div>
                    </div>
                    
                    {/* Visual Timeline Indicator directly on card */}
                    <div 
                      onClick={(e) => { e.stopPropagation(); setEditingDatesId(subject.id!); }}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        fontSize: '0.875rem',
                        padding: '0.4rem 0.75rem',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--surface-hover)',
                        border: '1px solid var(--border-color)',
                        cursor: 'text'
                      }}
                    >
                      <Calendar size={14} className={subject.startDate ? 'text-primary' : 'text-muted'} />
                      <span className={subject.startDate ? 'text-primary' : 'text-muted'}>{timelineLabel}</span>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }} onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" style={{ color: 'var(--color-red)', padding: '0.5rem' }} onClick={(e) => handleDeleteSubject(e, subject.id!)}>
                      <Trash2 size={18} />
                    </Button>
                    <Button variant="ghost" style={{ padding: '0.5rem' }} onClick={() => setExpandedId(isExpanded ? null : subject.id!)}>
                      {isExpanded ? <ChevronUp /> : <ChevronDown />}
                    </Button>
                  </div>
                </Card>

                {isEditingDates && (
                  <Card style={{ padding: '1rem', marginLeft: '1rem', backgroundColor: 'var(--surface-active)', border: '1px solid var(--border-color)', borderLeft: `4px solid ${subjectColor}` }}>
                    <h4 style={{ fontSize: '0.875rem', marginBottom: '0.75rem', fontWeight: 600 }}>Modify Active Timeline</h4>
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        const start = (e.target as any).start.value;
                        const end = (e.target as any).end.value;
                        handleDateUpdate(subject.id!, start, end);
                      }}
                      style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="text-secondary" style={{ fontSize: '0.875rem' }}>Start</span>
                        <Input type="date" name="start" defaultValue={formatTimestamp(subject.startDate)} required />
                      </div>
                      <span className="text-muted">→</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="text-secondary" style={{ fontSize: '0.875rem' }}>End</span>
                        <Input type="date" name="end" defaultValue={formatTimestamp(subject.endDate)} required />
                      </div>
                      
                      <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                         <Button type="button" variant="ghost" onClick={() => clearDates(subject.id!)} style={{ color: 'var(--color-red)' }}>Clear</Button>
                         <Button type="submit" className="ui-btn-primary">Save Timeline</Button>
                      </div>
                    </form>
                  </Card>
                )}

                {isExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1rem 0 1rem 1.5rem', borderLeft: '2px solid var(--border-color)', marginLeft: '1rem' }}>
                    
                    {/* Topic Controls */}
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                      <textarea 
                        className="ui-input" 
                        rows={2} 
                        placeholder="Bulk Add Subtopics (one per line)..."
                        value={bulkInput}
                        onChange={e => setBulkInput(e.target.value)}
                        style={{ resize: 'vertical', flex: 1 }}
                      />
                      <Button onClick={() => handleBulkAdd(subject.id!)} disabled={!bulkInput.trim()}><Plus size={16}/> Build</Button>
                    </div>

                    {/* Topic List */}
                    {subjectTopics.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span className="text-secondary" style={{ fontSize: '0.875rem' }}>{completedCount} / {subjectTopics.length} Matrix complete</span>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Button variant="secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => markAll(subject.id!, true)}><CheckSquare size={14} style={{ marginRight: '0.3rem' }}/> Mark All</Button>
                            <Button variant="ghost" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => markAll(subject.id!, false)}>Reset</Button>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
                          {subjectTopics.map(topic => {
                            const isCompleted = topic.status === 'Completed';

                            return (
                              <div 
                                key={topic.id} 
                                style={{ 
                                  padding: '0.75rem 1rem', 
                                  backgroundColor: 'var(--surface-color)', 
                                  border: '1px solid var(--border-color)', 
                                  borderRadius: 'var(--radius-sm)',
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '1rem',
                                  transition: 'all 0.1s ease',
                                  opacity: isCompleted ? 0.6 : 1
                                }}
                              >
                                <input 
                                  type="checkbox" 
                                  checked={isCompleted} 
                                  onChange={() => toggleTopic(topic)}
                                  style={{ cursor: 'pointer', width: '18px', height: '18px', accentColor: 'var(--color-blue)' }}
                                />
                                <span style={{ 
                                  flex: 1, 
                                  fontSize: '0.875rem', 
                                  textDecoration: isCompleted ? 'line-through' : 'none',
                                  color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)'
                                }}>
                                  {topic.name}
                                </span>
                                <Button variant="ghost" onClick={() => db.topics.delete(topic.id!)} style={{ padding: '0.2rem', color: 'var(--text-muted)' }}>
                                  <Trash2 size={14}/>
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
