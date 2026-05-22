import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PlannerSlot } from '../db';
import { Card, Button, Input, Select } from '../components/ui';
import { Plus, CheckCircle, Circle, Trash2, Save } from 'lucide-react';
import { SubjectTag } from '../components/SubjectTag';
import { resolveSubjectColor } from '../utils/subjectColors';
import { formatMinutesHuman, getSlotActualMinutes, getSlotDurationMinutes, getSlotLoggedRange } from '../utils/studyStats';

const getMinutes = (timeStr: string) => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const isLoggedRangeInsideSlot = (slot: PlannerSlot, loggedStartTime: string, loggedEndTime: string) => {
  const plannedStart = getMinutes(slot.startTime);
  const plannedEnd = getMinutes(slot.endTime);
  const actualStart = getMinutes(loggedStartTime);
  const actualEnd = getMinutes(loggedEndTime);

  return actualStart >= plannedStart && actualEnd <= plannedEnd && actualEnd > actualStart;
};

export default function Planner() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('11:00');
  const [newSubjectId, setNewSubjectId] = useState<number | ''>('');
  const [newType, setNewType] = useState<'lecture' | 'practice' | 'revision' | 'test'>('lecture');

  const subjects = useLiveQuery(() => db.subjects.toArray());
  const slots = useLiveQuery(
    () => db.plannerSlots.where('date').equals(selectedDate).sortBy('startTime'),
    [selectedDate]
  ) || [];
  const studySessions = useLiveQuery(() => db.studySessions.toArray()) ?? [];
  const sessionById = new Map(studySessions.map(session => [session.id!, session]));

  const syncPlannerSession = async (slot: PlannerSlot) => {
    if (!slot.id) return;

    const linkedSession = slot.linkedSessionId ? await db.studySessions.get(slot.linkedSessionId) : undefined;
    const { startTime, endTime, durationMinutes } = getSlotLoggedRange(slot, linkedSession);

    const existing = (await db.studySessions.filter(s => s.plannerSlotId === slot.id).toArray())[0];

    if (existing?.id) {
      await db.studySessions.update(existing.id, {
        subjectId: slot.subjectId,
        topicId: slot.topicId,
        startTime,
        endTime,
        durationMinutes,
        type: 'planned'
      });

      if (slot.linkedSessionId !== existing.id) {
        await db.plannerSlots.update(slot.id, { linkedSessionId: existing.id });
      }
      return;
    }

    const linkedSessionId = await db.studySessions.add({
      subjectId: slot.subjectId,
      topicId: slot.topicId,
      startTime,
      endTime,
      durationMinutes,
      type: 'planned',
      plannerSlotId: slot.id,
      questionsSolved: 0,
      pyqsSolved: 0
    });
    await db.plannerSlots.update(slot.id, { linkedSessionId });
  };

  const clearPlannerSession = async (slot: PlannerSlot) => {
    if (!slot.id) return;
    const existing = (await db.studySessions.filter(s => s.plannerSlotId === slot.id).toArray())[0];
    if (!existing?.id) return;
    await db.studySessions.delete(existing.id);
      };

  const recalculateStudyStats = async () => {
    const [allPlannerSlots, allSessions] = await Promise.all([
      db.plannerSlots.toArray(),
      db.studySessions.toArray()
    ]);

    for (const slot of allPlannerSlots) {
      if (!slot.id) continue;
      if (slot.completed) {
        await syncPlannerSession(slot);
      } else {
        await clearPlannerSession(slot);
      }
    }

    const plannedSessions = allSessions.filter(session => session.plannerSlotId);
    const validSlotIds = new Set(allPlannerSlots.map(slot => slot.id).filter((id): id is number => Boolean(id)));
    const orphanSessionIds = plannedSessions
      .filter(session => !session.plannerSlotId || !validSlotIds.has(session.plannerSlotId))
      .map(session => session.id)
      .filter((id): id is number => Boolean(id));

    if (orphanSessionIds.length > 0) {
      await db.studySessions.bulkDelete(orphanSessionIds);
    }
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStartTime || !newEndTime || newSubjectId === '') return;
    
    await db.plannerSlots.add({
      date: selectedDate,
      startTime: newStartTime,
      endTime: newEndTime,
      subjectId: Number(newSubjectId),
      type: newType,
      completed: false
    });
  };

  const toggleComplete = async (e: React.MouseEvent, slot: PlannerSlot) => {
    e.stopPropagation();
    if (!slot.id) return;

    const nextCompleted = !slot.completed;
    await db.plannerSlots.update(slot.id, { completed: nextCompleted });

    await recalculateStudyStats();
  };

  const handleSaveLoggedTime = async (e: React.FormEvent<HTMLFormElement>, slot: PlannerSlot) => {
    e.preventDefault();
    e.stopPropagation();
    if (!slot.id) return;

    const formData = new FormData(e.currentTarget);
    const loggedStartTime = String(formData.get('loggedStartTime') || '');
    const loggedEndTime = String(formData.get('loggedEndTime') || '');

    if (!isLoggedRangeInsideSlot(slot, loggedStartTime, loggedEndTime)) {
      alert('Log a time range inside the planned block.');
      return;
    }

    await db.plannerSlots.update(slot.id, {
      loggedStartTime,
      loggedEndTime,
      completed: true
    });

    const updatedSlot = await db.plannerSlots.get(slot.id);
    if (updatedSlot) {
      await syncPlannerSession(updatedSlot);
    }
  };

  const handleDelete = async (id?: number) => {
    if (!id) return;
    await db.plannerSlots.delete(id);
    await recalculateStudyStats();
  };

  const processSlots = (slotsArr: PlannerSlot[]) => {
    const processed = slotsArr.map(s => ({ ...s, col: 0, maxCol: 1 }));
    for (let i = 0; i < processed.length; i++) {
      let col = 0;
      const sStart = getMinutes(processed[i].startTime);
      const sEnd = getMinutes(processed[i].endTime);
      
      for (let j = 0; j < i; j++) {
        const oStart = getMinutes(processed[j].startTime);
        const oEnd = getMinutes(processed[j].endTime);
        if (sStart < oEnd && sEnd > oStart && processed[j].col === col) {
          col++;
        }
      }
      processed[i].col = col;
    }
    const maxCol = Math.max(...processed.map(s => s.col)) + 1;
    processed.forEach(s => s.maxCol = maxCol);
    return processed;
  };

  const timelineHours = Array.from({ length: 24 }).map((_, i) => i);
  const processedSlots = processSlots(slots);

  const totalPlannedMinutes = slots.reduce((sum, slot) => sum + getSlotDurationMinutes(slot), 0);
  const totalStudiedMinutes = slots.reduce((sum, slot) => {
    if (!slot.completed) return sum;
    const linked = slot.linkedSessionId ? sessionById.get(slot.linkedSessionId) : undefined;
    return sum + getSlotActualMinutes(slot, linked);
  }, 0);
  const efficiencyPercent = totalPlannedMinutes > 0
    ? Math.round((totalStudiedMinutes / totalPlannedMinutes) * 100)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>Daily Planner</h1>
          <p className="text-secondary">Time-block your schedule and track actual focus time.</p>
        </div>
        <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={{ width: '200px' }} />
      </div>

      <Card>
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: 500 }}>Create Time Block</h3>
        <form onSubmit={handleAddSlot} style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Input type="time" required value={newStartTime} onChange={(e) => setNewStartTime(e.target.value)} style={{ width: '130px' }} />
          <span className="text-secondary">-</span>
          <Input type="time" required value={newEndTime} onChange={(e) => setNewEndTime(e.target.value)} style={{ width: '130px' }} />
          
          <Select required value={newSubjectId} onChange={(e) => setNewSubjectId(e.target.value ? Number(e.target.value) : '')} style={{ minWidth: '150px', flex: 1 }}>
            <option value="">Target Subject...</option>
            {subjects?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>

          <Select value={newType} onChange={(e) => setNewType(e.target.value as 'lecture' | 'practice' | 'revision' | 'test')} style={{ width: '150px' }}>
            <option value="lecture">Lecture / Theory</option>
            <option value="practice">Practice / PYQ</option>
            <option value="revision">Revision</option>
            <option value="test">Mock Test</option>
          </Select>

          <Button type="submit"><Plus size={16} /> Block Time</Button>
        </form>
      </Card>

 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        <Card>
          <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '0.4rem' }}>Total Hours Planned</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{formatMinutesHuman(totalPlannedMinutes)}</div>
        </Card>
        <Card>
          <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '0.4rem' }}>Total Hours Studied</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{formatMinutesHuman(totalStudiedMinutes)}</div>
        </Card>
        <Card>
          <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '0.4rem' }}>Efficiency</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{efficiencyPercent}%</div>
        </Card>
      </div>

      <div style={{ position: 'relative', marginTop: '1rem', backgroundColor: 'var(--surface-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', overflowY: 'auto', height: '800px' }}>
        
        <div style={{ position: 'relative', minHeight: `${24 * 60}px` }}>
          {timelineHours.map(hour => (
            <div key={hour} style={{ position: 'absolute', top: `${hour * 60}px`, left: 0, width: '100%', borderTop: '1px solid var(--border-subtle)', display: 'flex' }}>
              <div style={{ width: '60px', padding: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.75rem', textAlign: 'right' }}>
                {hour.toString().padStart(2, '0')}:00
              </div>
            </div>
          ))}

          <div style={{ position: 'absolute', top: 0, left: '60px', right: '10px', height: '100%' }}>
            {processedSlots.map(slot => {
              const startMin = getMinutes(slot.startTime);
              const endMin = getMinutes(slot.endTime);
              const height = endMin - startMin;
              const subject = subjects?.find(s => s.id === slot.subjectId);
              const subjectColor = resolveSubjectColor(subject);
              const leftPercent = (slot.col / slot.maxCol) * 100;
              const widthPercent = (1 / slot.maxCol) * 100;
              const linked = slot.linkedSessionId ? sessionById.get(slot.linkedSessionId) : undefined;
              const plannedMinutes = getSlotDurationMinutes(slot);
              const actualMinutes = slot.completed ? getSlotActualMinutes(slot, linked) : 0;
              const progressPercent = plannedMinutes > 0 ? Math.min(100, Math.round((actualMinutes / plannedMinutes) * 100)) : 0;
              const loggedStartTime = slot.loggedStartTime ?? slot.startTime;
              const loggedEndTime = slot.loggedEndTime ?? slot.endTime;
              const progressTone = slot.completed ? subjectColor : 'rgba(255,255,255,0.22)';

              return (
                <Card
                  key={slot.id}
                  className="clickable"
                  style={{
                    position: 'absolute',
                    top: `${startMin}px`,
                    minHeight: `${Math.max(height, 124)}px`,
                    left: `${leftPercent}%`,
                    width: `calc(${widthPercent}% - 4px)`,
                    padding: '0.9rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.55rem',
                    overflow: 'hidden',
                    zIndex: 10,
                    opacity: slot.completed ? 0.94 : 1,
                    borderLeft: `4px solid ${subjectColor}`,
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))',
                    boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
                    borderColor: 'rgba(255,255,255,0.08)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', minWidth: 0 }}>
                      <button
                        title={slot.completed ? 'Mark incomplete' : 'Mark complete'}
                        onClick={(e) => toggleComplete(e, slot)}
                        style={{
                          color: slot.completed ? subjectColor : 'var(--text-secondary)',
                          width: 22,
                          height: 22,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        {slot.completed ? <CheckCircle size={18} /> : <Circle size={18} />}
                      </button>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', minWidth: 0 }}>
                          <SubjectTag name={subject?.name || 'Unknown'} color={subject?.color} />
                        </span>
                        <div className="text-secondary" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {slot.startTime} - {slot.endTime} • <span style={{ textTransform: 'capitalize' }}>{slot.type}</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" title="Delete block" onClick={(e) => { e.stopPropagation(); handleDelete(slot.id); }} style={{ width: 28, height: 28, padding: 0, color: 'var(--danger-color)', flexShrink: 0 }}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', gap: '0.75rem' }}>
                      <span className="text-secondary">Logged focus</span>
                      <span style={{ fontWeight: 600, color: slot.completed ? 'var(--text-primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {formatMinutesHuman(actualMinutes)} / {formatMinutesHuman(plannedMinutes)}
                      </span>
                    </div>
                    <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.055)', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${progressPercent}%`,
                          height: '100%',
                          borderRadius: 999,
                          background: progressTone,
                          boxShadow: slot.completed ? `0 0 16px ${subjectColor}55` : 'none',
                          transition: 'width 0.35s ease'
                        }}
                      />
                    </div>
                  </div>
                  <form
                    onSubmit={(e) => handleSaveLoggedTime(e, slot)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.35rem',
                      width: 'fit-content',
                      maxWidth: '100%',
                      marginTop: 'auto',
                      padding: '0.32rem',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.035)'
                    }}
                  >
                    <span className="text-muted" style={{ fontSize: '0.68rem', padding: '0 0.25rem', whiteSpace: 'nowrap' }}>Actual</span>
                    <Input
                      aria-label="Actual start time"
                      name="loggedStartTime"
                      type="time"
                      min={slot.startTime}
                      max={slot.endTime}
                      defaultValue={loggedStartTime}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: 92, height: 30, padding: '0.25rem 0.45rem', fontSize: '0.72rem', background: 'rgba(255,255,255,0.04)' }}
                    />
                    <span className="text-muted" style={{ fontSize: '0.72rem' }}>-</span>
                    <Input
                      aria-label="Actual end time"
                      name="loggedEndTime"
                      type="time"
                      min={slot.startTime}
                      max={slot.endTime}
                      defaultValue={loggedEndTime}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: 92, height: 30, padding: '0.25rem 0.45rem', fontSize: '0.72rem', background: 'rgba(255,255,255,0.04)' }}
                    />
                    <Button
                      type="submit"
                      variant="secondary"
                      title="Save actual time"
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: 30, height: 30, padding: 0, borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}
                    >
                      <Save size={14} />
                    </Button>
                  </form>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
