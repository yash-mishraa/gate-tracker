import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type StudySession } from '../db';
import { 
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, 
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, 
  startOfDay, endOfDay 
} from 'date-fns';
import { Card, Button, Input, Select } from '../components/ui';
import { ChevronLeft, ChevronRight, X, Clock, Trash2, Plus, Target, BookOpen } from 'lucide-react';

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Live queries 
  const subjects = useLiveQuery(() => db.subjects.toArray(), []) || [];
  const topics = useLiveQuery(() => db.topics.toArray(), []) || [];
  const allSessions = useLiveQuery(() => db.studySessions.toArray(), []) || [];

  // Manual Session State
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualSubjectId, setManualSubjectId] = useState<number | ''>('');
  const [manualTopicId, setManualTopicId] = useState<number | ''>('');
  const [manualDuration, setManualDuration] = useState<number | ''>('');
  const [manualQs, setManualQs] = useState<number>(0);
  const [manualPyqs, setManualPyqs] = useState<number>(0);

  // Month navigation logic
  const startDate = startOfWeek(startOfMonth(currentDate));
  const endDate = endOfWeek(endOfMonth(currentDate));
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const getSessionsForDay = (date: Date) => {
    const sStart = startOfDay(date).getTime();
    const sEnd = endOfDay(date).getTime();
    return allSessions.filter(s => s.startTime >= sStart && s.startTime <= sEnd);
  };

  const calculateDailyMetrics = (sessionsInfo: StudySession[]) => {
    const totalMinutes = sessionsInfo.reduce((acc, s) => acc + s.durationMinutes, 0);
    const totalQs = sessionsInfo.reduce((acc, s) => acc + s.questionsSolved, 0);
    const totalPyqs = sessionsInfo.reduce((acc, s) => acc + s.pyqsSolved, 0);
    
    // De-duplicating sets
    const subjectSet = new Set(sessionsInfo.map(s => s.subjectId));
    const topicSet = new Set(sessionsInfo.filter(s => s.topicId).map(s => s.topicId));

    return { totalMinutes, totalQs, totalPyqs, subjectsHit: subjectSet.size, topicsHit: topicSet.size };
  };

  const activeDaySessions = selectedDate ? getSessionsForDay(selectedDate) : [];
  const dailyStats = calculateDailyMetrics(activeDaySessions);

  // Handle manual session save
  const handleSaveManualSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || manualSubjectId === '' || manualDuration === '') return;

    // Default start time is noon of selected date for manual padding
    const baseTime = new Date(selectedDate);
    baseTime.setHours(12, 0, 0, 0);

    await db.studySessions.add({
      startTime: baseTime.getTime(),
      endTime: baseTime.getTime() + (Number(manualDuration) * 60000),
      durationMinutes: Number(manualDuration),
      subjectId: Number(manualSubjectId),
      topicId: manualTopicId ? Number(manualTopicId) : undefined,
      type: 'practice',
      questionsSolved: manualQs,
      pyqsSolved: manualPyqs
    });

    setShowManualForm(false);
    setManualDuration('');
    setManualQs(0);
    setManualPyqs(0);
  };

  const deleteSession = async (id?: number) => {
    if (!id) return;
    if (confirm("Are you sure you want to delete this session?")) {
      await db.studySessions.delete(id);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '2rem', height: '100%' }}>
      
      {/* Calendar Primary View */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>Preparation History</h1>
            <p className="text-secondary">Track long-term productivity and derive daily activity logs.</p>
          </div>

          {/* Month Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Button variant="secondary" onClick={() => setCurrentDate(subMonths(currentDate, 1))} style={{ padding: '0.5rem' }}>
              <ChevronLeft size={20} />
            </Button>
            <h2 style={{ fontSize: '1.25rem', minWidth: '150px', textAlign: 'center' }}>
              {format(currentDate, 'MMMM yyyy')}
            </h2>
            <Button variant="secondary" onClick={() => setCurrentDate(addMonths(currentDate, 1))} style={{ padding: '0.5rem' }}>
              <ChevronRight size={20} />
            </Button>
          </div>
        </div>

        {/* The Core Calendar Grid */}
        <Card style={{ padding: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1rem', letterSpacing: '0.05em' }}>
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
              <div key={day} className="text-secondary" style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                {day}
              </div>
            ))}

            {days.map(day => {
              const daySessions = getSessionsForDay(day);
              const { totalMinutes } = calculateDailyMetrics(daySessions);

              const isCurrentMonth = isSameMonth(day, currentDate);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isToday = isSameDay(day, new Date());
              
              // Status formatting
              const hours = totalMinutes / 60;
              let dotLevel = 0;
              if (hours > 0 && hours < 2) dotLevel = 1;
              if (hours >= 2 && hours <= 5) dotLevel = 2;
              if (hours > 5) dotLevel = 3;

              return (
                <div 
                  key={day.toString()} 
                  onClick={() => setSelectedDate(day)}
                  style={{
                    aspectRatio: '1',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'var(--surface-active)' : 'transparent',
                    border: isToday ? '1px solid var(--accent-faint)' : '1px solid transparent',
                    opacity: isCurrentMonth ? 1 : 0.3,
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  <span style={{ fontSize: '1rem', fontWeight: isToday ? 600 : 400 }}>
                    {format(day, 'd')}
                  </span>

                  {/* Dot Indicators */}
                  <div style={{ display: 'flex', gap: '3px', marginTop: '4px', height: '4px' }}>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} style={{
                        width: '4px', height: '4px', borderRadius: '50%',
                        backgroundColor: i < dotLevel ? 'var(--success-color)' : 'transparent',
                        opacity: 0.8
                      }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Auto Daily Log Sliding Detail Drawer */}
      {selectedDate && (
        <Card style={{ width: '400px', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.25rem' }}>{format(selectedDate, 'MMMM do, yyyy')}</h3>
            <Button variant="ghost" onClick={() => setSelectedDate(null)} style={{ padding: '0.2rem' }}>
              <X size={20} />
            </Button>
          </div>

          {activeDaySessions.length > 0 ? (
            <>
              {/* Daily Log Snapshot */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
                <div style={{ backgroundColor: 'var(--surface-hover)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Total Hours</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{(dailyStats.totalMinutes / 60).toFixed(1)}h</div>
                </div>
                <div style={{ backgroundColor: 'var(--surface-hover)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Breadth</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{dailyStats.subjectsHit} Subs • {dailyStats.topicsHit} Tpcs</div>
                </div>
                <div style={{ backgroundColor: 'var(--surface-hover)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Practice Qs</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--accent-color)' }}><BookOpen size={16} style={{ display: 'inline', marginBottom: '-2px' }}/> {dailyStats.totalQs}</div>
                </div>
                <div style={{ backgroundColor: 'var(--surface-hover)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>PYQs Mastered</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--success-color)' }}><Target size={16} style={{ display: 'inline', marginBottom: '-2px' }}/> {dailyStats.totalPyqs}</div>
                </div>
              </div>

              {/* Sessions List */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>Logged Sessions</h4>
                  <Button variant="ghost" className="text-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem' }} onClick={() => setShowManualForm(!showManualForm)}>
                    <Plus size={14}/> Add Manual
                  </Button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {activeDaySessions.map(session => {
                    const subName = subjects.find(s => s.id === session.subjectId)?.name || 'Unknown';
                    const topName = topics.find(t => t.id === session.topicId)?.name;
                    return (
                      <div key={session.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-color)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{subName} {topName && <span className="text-muted">/ {topName}</span>}</div>
                          <div className="text-secondary" style={{ fontSize: '0.75rem', display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><Clock size={12}/> {session.durationMinutes}m</span>
                            <span style={{ textTransform: 'capitalize' }}>• {session.type}</span>
                          </div>
                        </div>
                        <Button variant="ghost" onClick={() => deleteSession(session.id)} style={{ padding: '0.2rem', color: 'var(--danger-color)' }}>
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)' }}>
              <div style={{ marginBottom: '1rem' }}>No activity tracked on this date.</div>
              <Button variant="secondary" onClick={() => setShowManualForm(true)}>Add Manual Archive Session</Button>
            </div>
          )}

          {/* Form for manual logs */}
          {showManualForm && (
            <form onSubmit={handleSaveManualSession} style={{ padding: '1rem', backgroundColor: 'var(--surface-hover)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h5 style={{ fontWeight: 600, fontSize: '0.875rem' }}>Add Log Entry</h5>
              
              <Select value={manualSubjectId} onChange={e => setManualSubjectId(e.target.value ? Number(e.target.value) : '')} required>
                <option value="">Subject...</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              
              <Select value={manualTopicId} onChange={e => setManualTopicId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Topic (Opt)...</option>
                {topics.filter(t => t.subjectId === manualSubjectId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0.5rem' }}>
                 <Input type="number" min="1" placeholder="Elapsed Mins" required value={manualDuration} onChange={e => setManualDuration(Number(e.target.value))} />
                 <Input type="number" min="0" placeholder="Focus Qs" value={manualQs} onChange={e => setManualQs(Number(e.target.value))} />
                 <Input type="number" min="0" placeholder="PYQs Solved" value={manualPyqs} onChange={e => setManualPyqs(Number(e.target.value))} style={{ gridColumn: 'span 2' }} />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button type="submit" className="ui-btn-primary" style={{ flex: 1 }}>Insert Log</Button>
                <Button type="button" variant="ghost" onClick={() => setShowManualForm(false)}>Cancel</Button>
              </div>
            </form>
          )}
          
        </Card>
      )}
    </div>
  );
}
