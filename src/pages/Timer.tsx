import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Card, Button, Select, Input } from '../components/ui';
import { Play, Square, Pause, Maximize, AlertCircle } from 'lucide-react';

export default function Timer() {
  const subjects = useLiveQuery(() => db.subjects.toArray(), []) || [];
  const topics = useLiveQuery(() => db.topics.toArray(), []) || [];

  const [mode, setMode] = useState<'stopwatch' | 'countdown'>('stopwatch');
  const [countdownMinutes, setCountdownMinutes] = useState(50);
  
  const [isRunning, setIsRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);

  const [selectedSubjectId, setSelectedSubjectId] = useState<number | ''>('');
  const [selectedTopicId, setSelectedTopicId] = useState<number | ''>('');
  const [type, setType] = useState<'lecture' | 'practice' | 'revision' | 'test'>('lecture');

  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [questionsSolved, setQuestionsSolved] = useState(0);
  const [pyqsSolved, setPyqsSolved] = useState(0);

  const [isFocusMode, setIsFocusMode] = useState(false);
  const timerDivRef = useRef<HTMLDivElement>(null);

  // Filter topics based on subject
  const availableTopics = topics.filter(t => t.subjectId === selectedSubjectId);

  // Reset topic if subject changes
  useEffect(() => {
    setSelectedTopicId('');
  }, [selectedSubjectId]);

  useEffect(() => {
    let interval: number;
    if (isRunning) {
      interval = window.setInterval(() => {
        setSeconds(s => {
          if (mode === 'countdown') {
            if (s <= 1) {
              handleAutoStop();
              return 0;
            }
            return s - 1;
          }
          return s + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, mode]);

  const handleAutoStop = () => {
    setIsRunning(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    }
    setShowSavePrompt(true);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFocusMode(isFs);
      
      // If we dropped out of fullscreen unexpectedly and timer was running, auto pause!
      if (!isFs && isRunning) {
        setIsRunning(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isRunning]);

  const toggleFocusMode = async () => {
    if (!document.fullscreenElement) {
      await timerDivRef.current?.requestFullscreen().catch(console.error);
    } else {
      await document.exitFullscreen().catch(console.error);
    }
  };

  const startTimer = () => {
    if (selectedSubjectId === '') {
      alert("Please select a subject first.");
      return;
    }
    if (mode === 'countdown' && seconds === 0) {
      setSeconds(countdownMinutes * 60);
    }
    if (!sessionStartTime) setSessionStartTime(Date.now());
    setIsRunning(true);
  };

  const pauseTimer = () => {
    setIsRunning(false);
  };

  const stopTimer = () => {
    setIsRunning(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    }
    if (sessionStartTime) {
      setShowSavePrompt(true);
    } else {
      resetTimer();
    }
  };

  const resetTimer = () => {
    setSeconds(mode === 'countdown' ? countdownMinutes * 60 : 0);
    setSessionStartTime(null);
    setShowSavePrompt(false);
    setQuestionsSolved(0);
    setPyqsSolved(0);
  };

  const splitAndSaveSessions = async (baseStart: number, durationSecs: number, subjectId: number, topicId?: number) => {
    const startObj = new Date(baseStart);
    const endObj = new Date(baseStart + durationSecs * 1000);

    const isMidnightCrossed = startObj.getDate() !== endObj.getDate() && startObj.getMonth() === endObj.getMonth() || startObj.getMonth() !== endObj.getMonth();

    if (isMidnightCrossed) {
      // Find the exact midnight boundary in the current timezone
      const midnight = new Date(startObj);
      midnight.setHours(23, 59, 59, 999);
      
      const duration1Ms = midnight.getTime() - startObj.getTime();
      const duration2Ms = endObj.getTime() - (midnight.getTime() + 1);

      // Save Part 1 (Before Midnight)
      await db.studySessions.add({
        startTime: startObj.getTime(),
        endTime: midnight.getTime(),
        durationMinutes: Math.floor(duration1Ms / 60000),
        subjectId,
        topicId,
        type,
        questionsSolved: Math.ceil(questionsSolved / 2),
        pyqsSolved: Math.ceil(pyqsSolved / 2)
      });

      // Save Part 2 (After Midnight)
      await db.studySessions.add({
        startTime: midnight.getTime() + 1,
        endTime: endObj.getTime(),
        durationMinutes: Math.floor(duration2Ms / 60000),
        subjectId,
        topicId,
        type,
        questionsSolved: Math.floor(questionsSolved / 2),
        pyqsSolved: Math.floor(pyqsSolved / 2)
      });
    } else {
      // Normal Save
      await db.studySessions.add({
        startTime: startObj.getTime(),
        endTime: endObj.getTime(),
        durationMinutes: Math.floor(durationSecs / 60),
        subjectId,
        topicId,
        type,
        questionsSolved,
        pyqsSolved
      });
    }
  };

  const handleSaveSession = async () => {
    if (!sessionStartTime || selectedSubjectId === '') return;
    
    // Calculate elapsed time based on mode
    let elapsedSeconds = 0;
    if (mode === 'stopwatch') {
      elapsedSeconds = seconds;
    } else {
      elapsedSeconds = (countdownMinutes * 60) - seconds;
    }

    if (elapsedSeconds < 60) {
      if (!confirm("Session is less than 1 minute. Save anyway?")) {
        resetTimer();
        return;
      }
    }

    await splitAndSaveSessions(
      sessionStartTime, 
      elapsedSeconds, 
      Number(selectedSubjectId), 
      selectedTopicId ? Number(selectedTopicId) : undefined
    );

    resetTimer();
  };

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (mode === 'countdown' && !sessionStartTime) {
      setSeconds(countdownMinutes * 60);
    } else if (mode === 'stopwatch' && !sessionStartTime) {
      setSeconds(0);
    }
  }, [mode, countdownMinutes]);

  const displayTime = formatTime(seconds);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {!isFocusMode && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>Focus Timer</h1>
            <p className="text-secondary">Track intensive study blocks and safely log sessions.</p>
          </div>
        </div>
      )}

      {/* Main Timer Container */}
      <div 
        ref={timerDivRef}
        style={{ 
          backgroundColor: isFocusMode ? '#000' : 'transparent',
          padding: isFocusMode ? '4rem' : '0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: isFocusMode ? '100vh' : 'auto',
          transition: 'all 0.3s ease'
        }}
      >
        <Card style={{ 
          maxWidth: '500px', 
          width: '100%',
          textAlign: 'center',
          padding: '2rem',
          border: isFocusMode ? 'none' : undefined,
          backgroundColor: isFocusMode ? '#000' : undefined,
          boxShadow: isFocusMode ? 'none' : undefined
        }}>
          
          {/* Mode Toggles */}
          {!sessionStartTime && !isFocusMode && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <Button variant={mode === 'stopwatch' ? 'primary' : 'ghost'} onClick={() => setMode('stopwatch')}>Stopwatch</Button>
              <Button variant={mode === 'countdown' ? 'primary' : 'ghost'} onClick={() => setMode('countdown')}>Countdown</Button>
            </div>
          )}

          {/* Countdown Input */}
          {mode === 'countdown' && !sessionStartTime && !isFocusMode && (
            <div style={{ marginBottom: '2rem' }}>
              <label className="text-secondary" style={{ fontSize: '0.875rem', display: 'block', marginBottom: '0.5rem' }}>Target Minutes</label>
              <Input 
                type="number" 
                min="1" 
                max="300"
                value={countdownMinutes} 
                onChange={(e) => setCountdownMinutes(Number(e.target.value))}
                style={{ width: '100px', textAlign: 'center' }}
              />
            </div>
          )}

          {/* Time Display */}
          <div style={{ 
            fontSize: isFocusMode ? '8rem' : '5rem', 
            fontWeight: 700, 
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
            lineHeight: 1,
            color: isRunning ? 'var(--text-primary)' : 'var(--text-secondary)',
            marginBottom: '2rem',
            transition: 'all 0.3s ease'
          }}>
            {displayTime}
          </div>

          {!sessionStartTime && !isFocusMode && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem', textAlign: 'left' }}>
              <div>
                <label className="text-secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>Subject <span>*</span></label>
                <Select value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Select...</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
              
              <div>
                <label className="text-secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>Topic (Optional)</label>
                <Select value={selectedTopicId} onChange={e => setSelectedTopicId(e.target.value ? Number(e.target.value) : '')} disabled={selectedSubjectId === ''}>
                  <option value="">General...</option>
                  {availableTopics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label className="text-secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>Session Type</label>
                <Select value={type} onChange={e => setType(e.target.value as any)}>
                  <option value="lecture">Lecture / Theory</option>
                  <option value="practice">Practice / Problem Solving</option>
                  <option value="revision">Revision</option>
                  <option value="test">Mock Test</option>
                </Select>
              </div>
            </div>
          )}

          {/* Controls */}
          {!showSavePrompt && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              {!isRunning ? (
                <Button onClick={startTimer} className="ui-btn-primary" style={{ padding: '0.75rem 2rem' }}>
                  <Play size={20} /> {sessionStartTime ? 'Resume' : 'Start Focus'}
                </Button>
              ) : (
                <Button onClick={pauseTimer} className="ui-btn-secondary" style={{ padding: '0.75rem 2rem' }}>
                  <Pause size={20} /> Pause
                </Button>
              )}
              
              {sessionStartTime && (
                <Button onClick={stopTimer} style={{ padding: '0.75rem 2rem', backgroundColor: 'var(--danger-color)', color: '#fff' }}>
                  <Square size={20} /> Finish
                </Button>
              )}

              <Button variant="ghost" onClick={toggleFocusMode} title="Toggle Focus Mode" style={{ padding: '0.75rem' }}>
                <Maximize size={20} />
              </Button>
            </div>
          )}

          {/* Pause Warning */}
          {sessionStartTime && !isRunning && !showSavePrompt && !isFocusMode && (
            <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--warning-color)', fontSize: '0.875rem' }}>
              <AlertCircle size={16} /> Timer paused. Escaping fullscreen will inherently pause.
            </div>
          )}

          {/* Save Prompt */}
          {showSavePrompt && (
            <div style={{ textAlign: 'left', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <h4 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Log Session Details</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label className="text-secondary" style={{ fontSize: '0.875rem', display: 'block', marginBottom: '0.5rem' }}>Practice Qs Solved</label>
                  <Input type="number" min="0" value={questionsSolved} onChange={e => setQuestionsSolved(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-secondary" style={{ fontSize: '0.875rem', display: 'block', marginBottom: '0.5rem' }}>PYQs Solved</label>
                  <Input type="number" min="0" value={pyqsSolved} onChange={e => setPyqsSolved(Number(e.target.value))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <Button className="ui-btn-primary" onClick={handleSaveSession} style={{ flex: 1 }}>Save Session</Button>
                <Button variant="ghost" onClick={resetTimer} style={{ flex: 1, color: 'var(--danger-color)' }}>Discard</Button>
              </div>
            </div>
          )}
        </Card>
      </div>

    </div>
  );
}
