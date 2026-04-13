import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PlannerSlot } from '../db';
import { Card, Button, Input, Select } from '../components/ui';
import { Plus, CheckCircle, Circle, Trash2, Clock } from 'lucide-react';
import { SubjectTag } from '../components/SubjectTag';
import { resolveSubjectColor } from '../utils/subjectColors';
import { formatMinutesHuman, getSlotDurationMinutes } from '../utils/studyStats';

const CREATE_NEW_SESSION = '__create_new__';

const getSlotTimestamps = (slot: PlannerSlot) => {
  const startTime = new Date(`${slot.date}T${slot.startTime}:00`).getTime();
  const endTime = new Date(`${slot.date}T${slot.endTime}:00`).getTime();
  return { startTime, endTime };
};

export default function Planner() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('11:00');
  const [newSubjectId, setNewSubjectId] = useState<number | ''>('');
  const [newType, setNewType] = useState<'lecture' | 'practice' | 'revision' | 'test'>('lecture');

  const subjects = useLiveQuery(() => db.subjects.toArray());
  const sessions = useLiveQuery(() => db.studySessions.toArray()) || [];
  const slots = useLiveQuery(
    () => db.plannerSlots.where('date').equals(selectedDate).sortBy('startTime'),
    [selectedDate]
  ) || [];
  const allSlots = useLiveQuery(() => db.plannerSlots.toArray()) || [];

  const syncPlannerSession = async (slot: PlannerSlot) => {
    if (!slot.id) return;

    const linkedSession = slot.linkedSessionId ? await db.studySessions.get(slot.linkedSessionId) : undefined;
    const { startTime: plannedStart, endTime: plannedEnd } = getSlotTimestamps(slot);
    const plannedDuration = Math.max(1, Math.round((plannedEnd - plannedStart) / 60000));

    const startTime = linkedSession?.startTime ?? plannedStart;
    const endTime = linkedSession?.endTime ?? plannedEnd;
    const durationMinutes = linkedSession?.durationMinutes ?? plannedDuration;

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
      return;
    }

    await db.studySessions.add({
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

  const handleDelete = async (id?: number) => {
    if (!id) return;
    await db.plannerSlots.delete(id);
    await recalculateStudyStats();
  };

  const getMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
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

  const getDaySessions = () => {
    return sessions
      .filter(s => new Date(s.startTime).toISOString().startsWith(selectedDate) && !s.plannerSlotId)
      .sort((a, b) => a.startTime - b.startTime);
  };

  const createSessionFromSlot = async (slot: PlannerSlot) => {
    const { startTime, endTime } = getSlotTimestamps(slot);
    const durationMinutes = Math.max(1, Math.round((endTime - startTime) / 60000));
    const id = await db.studySessions.add({
      subjectId: slot.subjectId,
      topicId: slot.topicId,
      startTime,
      endTime,
      durationMinutes,
      type: slot.type,
      questionsSolved: 0,
      pyqsSolved: 0
    });
     return Number(id);
  };

  const totalPlannedMinutes = allSlots.reduce((sum, slot) => sum + getSlotDurationMinutes(slot), 0);
  const totalStudiedMinutes = allSlots.reduce((sum, slot) => {
    if (!slot.completed) return sum;
    const linked = slot.linkedSessionId ? sessions.find(session => session.id === slot.linkedSessionId) : undefined;
    return sum + (linked?.durationMinutes ?? getSlotDurationMinutes(slot));
  }, 0);
  const efficiencyPercent = totalPlannedMinutes > 0
    ? Math.round((totalStudiedMinutes / totalPlannedMinutes) * 100)
    : 0;


  const linkSession = async (slot: PlannerSlot, selection: string) => {
    if (!slot.id) return;

    let linkedSessionId: number | undefined;
    if (!selection) {
      linkedSessionId = undefined;
    } else if (selection === CREATE_NEW_SESSION) {
      linkedSessionId = await createSessionFromSlot(slot);
    } else {
      linkedSessionId = Number(selection);
    }

    await db.plannerSlots.update(slot.id, { linkedSessionId });

    if (slot.completed) {
      await syncPlannerSession({ ...slot, linkedSessionId });
      await recalculateStudyStats();      
    }
  };

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
              const linkedSession = sessions.find(s => s.id === slot.linkedSessionId);
              const subjectColor = resolveSubjectColor(subject);
              const leftPercent = (slot.col / slot.maxCol) * 100;
              const widthPercent = (1 / slot.maxCol) * 100;

              return (
                <Card
                  key={slot.id}
                  className="clickable"
                  style={{
                    position: 'absolute',
                    top: `${startMin}px`,
                    height: `${height}px`,
                    left: `${leftPercent}%`,
                    width: `calc(${widthPercent}% - 4px)`,
                    padding: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    overflow: 'hidden',
                    zIndex: 10,
                    opacity: slot.completed ? 0.7 : 1,
                    borderLeft: `4px solid ${subjectColor}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button onClick={(e) => toggleComplete(e, slot)} style={{ color: slot.completed ? 'var(--success-color)' : 'var(--text-secondary)' }}>
                        {slot.completed ? <CheckCircle size={18} /> : <Circle size={18} />}
                      </button>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                        <SubjectTag name={subject?.name || 'Unknown'} color={subject?.color} />
                      </span>
                    </div>
                    <Button variant="ghost" onClick={(e) => { e.stopPropagation(); handleDelete(slot.id); }} style={{ padding: '0.2rem', color: 'var(--danger-color)' }}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  
                  <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                    {slot.startTime} - {slot.endTime} • <span style={{ textTransform: 'capitalize' }}>{slot.type}</span>
                  </div>

                  <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {!linkedSession ? (
                      <Select
                        style={{ fontSize: '0.70rem', padding: '0.2rem', backgroundColor: 'transparent' }}
                        value=""
                        onChange={(e) => linkSession(slot, e.target.value)}
                      >
                        <option value="">Link Actual Session...</option>
                        {getDaySessions().map(sess => (
                          <option key={sess.id} value={sess.id!}>{formatMinutesHuman(sess.durationMinutes)} ({sess.type})</option>
                        ))}
                        <option value={CREATE_NEW_SESSION}>Create new session</option>
                      </Select>
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: 'var(--success-color)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={12} /> Actual: {formatMinutesHuman(linkedSession.durationMinutes)}
                        <Button variant="ghost" onClick={(e) => { e.stopPropagation(); linkSession(slot, ''); }} style={{ padding: '0 0.2rem' }}>x</Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
