import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PyqTopic, type Subject } from '../db';
import { Card } from '../components/ui';
import { AlertTriangle, Clock, Target, Ghost } from 'lucide-react';
import { differenceInDays } from 'date-fns';

export default function Analytics() {
  const subjects: Subject[] = useLiveQuery(() => db.subjects.toArray()) ?? [];
  const pyqTopics: PyqTopic[] = useLiveQuery(() => db.pyqTopics.toArray()) ?? [];
  const studySessions = useLiveQuery(() => db.studySessions.toArray()) ?? [];
  const testSubjects = useLiveQuery(() => db.testSubjects.toArray()) ?? [];
  const tests = useLiveQuery(() => db.tests.toArray()) ?? [];

  const deriveStrength = (t: PyqTopic) => {
    const progress = t.attemptedQuestions / t.totalQuestions;
    const accuracy = t.attemptedQuestions === 0 ? 0 : t.correctQuestions / t.attemptedQuestions;
    if (progress < 0.4 || accuracy < 0.6 || (t.totalQuestions > 10 && t.attemptedQuestions < 5)) return 'Weak';
    if (progress > 0.8 && accuracy >= 0.8) return 'Strong';
    return 'Average';
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Strong': return 'var(--success-color)';
      case 'Average': return 'var(--warning-color)';
      case 'Weak': return 'var(--danger-color)';
      default: return 'var(--text-muted)';
    }
  };

  // --- Confidence Check ---
  const hasEnoughData = studySessions.length >= 5;

  if (!hasEnoughData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>Deep Analytics</h1>
          <p className="text-secondary">AI-driven extraction of your behavioral patterns.</p>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
          <AlertTriangle size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Not enough data yet</h3>
          <p>The analytics engine requires a minimum baseline of 5 completed study sessions to guarantee accurate heuristics.</p>
          <div style={{ marginTop: '1rem', padding: '0.5rem 1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem' }}>
            Current Sessions Verified: {studySessions.length} / 5
          </div>
        </div>
      </div>
    );
  }

  // --- Productivity Insights ---
  
  // 1. Best Study Time (Map hours 0-23 grouping total durationMinutes)
  const hourBuckets = Array(24).fill(0);
  studySessions.forEach(session => {
    const hour = new Date(session.startTime).getHours();
    hourBuckets[hour] += session.durationMinutes;
  });
  const maxMins = Math.max(...hourBuckets);
  const bestHour = hourBuckets.indexOf(maxMins);
  const bestHourString = bestHour !== -1 && maxMins > 0 
    ? `${bestHour.toString().padStart(2, '0')}:00 - ${(bestHour + 1).toString().padStart(2, '0')}:00` 
    : 'Unknown';

  // 2. Most Ignored Topic
  const tenDaysMs = 10 * 86400000;
  const now = Date.now();
  const ignoredTopic: PyqTopic | undefined = pyqTopics
    .filter(t => t.lastUpdated && (now - t.lastUpdated > tenDaysMs) && (t.attemptedQuestions < t.totalQuestions))
    .sort((a, b) => (a.lastUpdated || 0) - (b.lastUpdated || 0))[0];

  // 3. Weakest Subject (Blended Vulnerability logic)
  let weakestSubject: Subject | null = null;
  let highestBlendedWeakness = -1;
  let weakestScoreComponents = { base: 0, mock: 0 };

  subjects.forEach(subject => {
    // A) Base Topic Weakness
    const sTopics = pyqTopics.filter(t => t.subjectId === subject.id);
    let baseTopicWeakness = 0;
    if (sTopics.length > 0) {
      const weakCount = sTopics.filter(t => deriveStrength(t) === 'Weak').length;
      baseTopicWeakness = weakCount / sTopics.length;
    }

    // B) Recency-Weighted Mock Performance
    const subjectTestRecords = testSubjects.filter(ts => ts.subjectId === subject.id);
    let totalWeight = 0;
    let weightedTestWeakness = 0;

    if (subjectTestRecords.length > 0) {
      subjectTestRecords.forEach(ts => {
        const parentTest = tests.find(t => t.id === ts.testId);
        if (parentTest) {
          const daysSince = Math.max(0, differenceInDays(new Date(), new Date(parentTest.date)));
          // Using an algorithmic exponential decay bounding half-life mapping realistically
          const recencyWeight = Math.max(0.1, Math.exp(-daysSince / 30)); 
          const accuracy = ts.marksObtained / ts.totalMarks;
          const weaknessMetrics = 1 - accuracy; // Flipped. Lower accuracy = higher weakness metric

          totalWeight += recencyWeight;
          weightedTestWeakness += weaknessMetrics * recencyWeight;
        }
      });
      weightedTestWeakness = totalWeight > 0 ? (weightedTestWeakness / totalWeight) : 0;
    }

    // Blend Logic: If mocks exist, they override baseline heavily (60/40 Split)
    const blendedWeakness = subjectTestRecords.length > 0 ? (0.4 * baseTopicWeakness) + (0.6 * weightedTestWeakness) : baseTopicWeakness;

    if (blendedWeakness > highestBlendedWeakness && (baseTopicWeakness > 0 || subjectTestRecords.length > 0)) {
      highestBlendedWeakness = blendedWeakness;
      weakestSubject = subject;
      weakestScoreComponents = { base: baseTopicWeakness, mock: weightedTestWeakness };
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>Deep Analytics</h1>
        <p className="text-secondary">AI-driven extraction of your behavioral patterns.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        
        {/* Best Study Time */}
        <Card style={{ borderTop: '4px solid var(--accent-color)' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--surface-hover)', borderRadius: 'var(--radius-md)' }}>
              <Clock className="text-secondary" />
            </div>
            <div>
              <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>Apex Focus Phase</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{bestHourString}</div>
              <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Based on {Math.round(maxMins / 60)} dense hours logged.</div>
            </div>
          </div>
        </Card>

        {/* Most Ignored Topic */}
        <Card style={{ borderTop: '4px solid var(--text-muted)' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--surface-hover)', borderRadius: 'var(--radius-md)' }}>
              <Ghost className="text-secondary" />
            </div>
            <div>
              <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>Most Ignored Component</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{ignoredTopic ? ignoredTopic.name : 'None Detected'}</div>
              {ignoredTopic && (
                <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                  Untouched for {Math.floor((now - (ignoredTopic.lastUpdated || now)) / 86400000)} days.
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Weakest Subject */}
        <Card style={{ borderTop: '4px solid var(--danger-color)' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--surface-hover)', borderRadius: 'var(--radius-md)' }}>
              <Target className="text-secondary" />
            </div>
            <div>
              <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>Vulnerable Subject</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--danger-color)' }}>{weakestSubject ? (weakestSubject as Subject).name : 'Unknown System'}</div>
              {weakestSubject && (
                <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                  {Math.round(highestBlendedWeakness * 100)}% structural weakness matrix. 
                  <span style={{ display: 'block', marginTop: '0.25rem', opacity: 0.8 }}>
                    {weakestScoreComponents.mock > 0 ? `(Mock Penalty: ${Math.round(weakestScoreComponents.mock * 100)}%)` : '(Foundational Data Only)'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </Card>

      </div>

      <Card>
        <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem', fontWeight: 500 }}>Global Topic Profiler</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {pyqTopics.map(topic => {
            const strength = deriveStrength(topic);
            const progress = (topic.attemptedQuestions / topic.totalQuestions) * 100;
            const accuracy = topic.attemptedQuestions === 0 ? 0 : Math.round((topic.correctQuestions / topic.attemptedQuestions) * 100);
            
            return (
              <Card key={topic.id} style={{ borderLeft: `3px solid ${getStatusColor(strength)}`, padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.2 }}>{topic.name}</h4>
                  <span style={{ 
                    color: getStatusColor(strength), 
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}>
                    {strength}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Progress Matrix:</span>
                    <span style={{ color: 'var(--text-primary)' }}>{Math.round(progress)}% Complete</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Precision Yield:</span>
                    <span style={{ color: 'var(--text-primary)' }}>{accuracy}% Accurate</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Card>
      
    </div>
  );
}
