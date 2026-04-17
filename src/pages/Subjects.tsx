import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteSubjectCascade, type Topic } from '../db';
import { Card, Button, Input } from '../components/ui';
import { Trash2, Plus, ChevronDown, ChevronUp, Calendar, CheckSquare, Pencil } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { SubjectTag } from '../components/SubjectTag';
import { resolveSubjectColor, SUBJECT_COLOR_PALETTE, getDeterministicSubjectColor } from '../utils/subjectColors';

export default function Subjects() {
  const subjects = useLiveQuery(() => db.subjects.toArray(), []) || [];
  const topics = useLiveQuery(() => db.topics.toArray(), []) || [];
  const studySessions = useLiveQuery(() => db.studySessions.toArray(), []) || [];


  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [bulkInput, setBulkInput] = useState('');
  const [editingDatesId, setEditingDatesId] = useState<number | null>(null);
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectColor, setNewSubjectColor] = useState('');
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [editingSubjectName, setEditingSubjectName] = useState('');
  const [editingSubjectColor, setEditingSubjectColor] = useState('');

  const isDuplicateSubjectName = (name: string, excludeId?: number) => {
    const normalized = name.trim().toLowerCase();
    return subjects.some(subject =>
      subject.id !== excludeId &&
      subject.name.trim().toLowerCase() === normalized
    );
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newSubjectName.trim();
    if (!trimmedName) {
      alert('Subject name cannot be empty.');
      return;
    }
    if (isDuplicateSubjectName(trimmedName)) {
      alert('A subject with this name already exists.');
      return;
    }

    await db.subjects.add({
      name: trimmedName,
      color: newSubjectColor || getDeterministicSubjectColor(trimmedName),
      lastUpdated: Date.now()
    });

    setNewSubjectName('');
    setNewSubjectColor('');
    setIsAddingSubject(false);
  };

  const beginEditSubject = (subjectId: number, currentName: string, currentColor?: string) => {
    setEditingSubjectId(subjectId);
    setEditingSubjectName(currentName);
    setEditingSubjectColor(currentColor || '');
  };

  const cancelEditSubject = () => {
    setEditingSubjectId(null);
    setEditingSubjectName('');
    setEditingSubjectColor('');
  };

  const saveSubjectEdit = async (e: React.FormEvent, subjectId: number) => {
    e.preventDefault();
    const trimmedName = editingSubjectName.trim();
    if (!trimmedName) {
      alert('Subject name cannot be empty.');
      return;
    }
    if (isDuplicateSubjectName(trimmedName, subjectId)) {
      alert('A subject with this name already exists.');
      return;
    }

    await db.subjects.update(subjectId, {
      name: trimmedName,
      color: editingSubjectColor || getDeterministicSubjectColor(trimmedName),
      lastUpdated: Date.now()
    });
    cancelEditSubject();
  };


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
    if (confirm("Delete this subject? This will remove all associated topics and tracking data.")) {
      await deleteSubjectCascade(id);
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
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant={isAddingSubject ? 'secondary' : 'primary'} onClick={() => setIsAddingSubject(prev => !prev)}>
          <Plus size={16} /> Add Subject
        </Button>
      </div>

      {isAddingSubject && (
        <Card style={{ padding: '1rem', borderStyle: 'dashed' }}>
          <form onSubmit={handleCreateSubject} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <Input
              value={newSubjectName}
              onChange={e => setNewSubjectName(e.target.value)}
              placeholder="Subject name"
              maxLength={50}
              style={{ minWidth: '220px', flex: 1 }}
            />
            <select className="ui-input" value={newSubjectColor} onChange={e => setNewSubjectColor(e.target.value)} style={{ width: '160px' }}>
              <option value="">Auto Color</option>
              {SUBJECT_COLOR_PALETTE.map(color => (
                <option key={color} value={color}>{color}</option>
              ))}
            </select>
            <Button type="submit" className="ui-btn-primary">Create</Button>
          </form>
        </Card>
      )}


      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {subjects.length === 0 ? (
          <Card style={{ padding: '3rem', textAlign: 'center' }}>
            <p className="text-secondary">Start by adding your first subject.</p>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flex: 1, minWidth: 0 }}>
                    <div style={{ minWidth: 0 }}>
                      {editingSubjectId === subject.id ? (
                        <form
                          onSubmit={(e) => saveSubjectEdit(e, subject.id!)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
                        >
                          <Input
                            value={editingSubjectName}
                            onChange={e => setEditingSubjectName(e.target.value)}
                            maxLength={50}
                            style={{ width: '220px' }}
                            autoFocus
                          />
                          <select className="ui-input" value={editingSubjectColor} onChange={e => setEditingSubjectColor(e.target.value)} style={{ width: '140px' }}>
                            <option value="">Auto</option>
                            {SUBJECT_COLOR_PALETTE.map(color => (
                              <option key={color} value={color}>{color}</option>
                            ))}
                          </select>
                          <Button type="submit" variant="secondary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}>Save</Button>
                          <Button type="button" variant="ghost" style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }} onClick={cancelEditSubject}>Cancel</Button>
                        </form>
                      ) : (
                        <>
                          <h3 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <SubjectTag name={subject.name} color={subject.color} />
                          </h3>
                          <div className="text-secondary" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                            {subjectTopics.length} Topics • {Math.round(progressPerc)}% Complete • {Math.round(((subject.timeSpent ?? studySessions.filter(s => s.subjectId === subject.id).reduce((acc, curr) => acc + curr.durationMinutes, 0)) / 60) * 10) / 10}h Tracked
                          </div>
                        </>
                      )}

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
                    <Button
                      variant="ghost"
                      style={{ padding: '0.5rem' }}
                      onClick={() => beginEditSubject(subject.id!, subject.name, subject.color)}
                      aria-label={`Edit ${subject.name}`}
                    >
                      <Pencil size={16} />
                    </Button>
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
