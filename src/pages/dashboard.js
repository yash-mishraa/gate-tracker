/* ========================================
   GATE Tracker — Dashboard Page (v5)
   + Intelligent Study Systems
   ======================================== */

import { getAll, todayStr, formatDuration } from '../db.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

// Re-using the exact logic from topics.js to ensure sync
const SPACED_INTERVALS = [1, 3, 7, 15, 30];
function getNextRevisionDate(lastDate, revCount) {
  if (!lastDate) return null;
  const idx = Math.min(revCount, SPACED_INTERVALS.length - 1);
  const days = SPACED_INTERVALS[idx];
  const d = new Date(lastDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(todayStr() + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}
function getTopicStrength(topic, topicMins) {
  let score = 50;
  const acc = topic.questionsAttempted > 0 ? (topic.correctAnswers / topic.questionsAttempted) * 100 : null;
  if (acc !== null) {
    if (acc >= 80) score += 20;
    else if (acc >= 60) score += 5;
    else if (acc < 40) score -= 20;
    else score -= 10;
  }
  if (topic.status !== 'completed' && topicMins > 120) score -= 15;
  if (topic.status === 'completed') score += 10;
  const nextRev = topic.nextRevisionDate || getNextRevisionDate(topic.lastRevisionDate, topic.revisionCount || 0);
  const dl = daysUntil(nextRev);
  if (dl !== null && dl < 0) score -= 10;
  if ((topic.revisionCount || 0) >= 3) score += 15;

  if (score >= 75) return { label: 'Strong', class: 'badge-success', color: 'var(--accent-500)', s: score };
  if (score <= 40) return { label: 'Weak', class: 'badge-danger', color: 'var(--danger-500)', s: score };
  return { label: 'Average', class: 'badge-warning', color: 'var(--warning-500)', s: score };
}

export async function dashboardPage() {
  const sessions = await getAll('studySessions');
  const subjects = await getAll('subjects');
  const tasks = await getAll('tasks');
  const topics = await getAll('topics');
  const tests = await getAll('testScores');

  const today = todayStr();
  const now = new Date();
  const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);

  // ── Original Stats ──
  const todayMins = sessions.filter(s => s.date === today).reduce((a, s) => a + (s.duration || 0), 0);
  let streak = 0;
  const dateSet = new Set(sessions.map(s => s.date));
  let d = new Date(today);
  while (dateSet.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }

  // ── Exam Readiness Score (out of 100) ──
  // 1. Syllabus (25 pts)
  const completedTopics = topics.filter(t => t.status === 'completed').length;
  const syllabusPts = topics.length > 0 ? (completedTopics / topics.length) * 25 : 0;
  
  // 2. Consistency (20 pts)
  const days30 = new Set(sessions.filter(s => new Date(s.date) >= monthAgo).map(s => s.date)).size;
  const consistPts = Math.min((days30 / 30) * 20, 20);

  // 3. Question Accuracy (20 pts)
  const totalAtt = topics.reduce((a, t) => a + (t.questionsAttempted || 0), 0);
  const totalCor = topics.reduce((a, t) => a + (t.correctAnswers || 0), 0);
  const accPts = totalAtt > 0 ? (totalCor / totalAtt) * 20 : 0;

  // 4. Revision (15 pts) - avg revs per completed topic, target 3
  const completedList = topics.filter(t => t.status === 'completed');
  const avgRev = completedList.length > 0 ? completedList.reduce((a, t) => a + (t.revisionCount || 0), 0) / completedList.length : 0;
  const revPts = Math.min((avgRev / 3) * 15, 15);

  // 5. Mock Tests (20 pts)
  const avgTestPct = tests.length > 0 ? tests.reduce((a, t) => a + (t.totalMarks > 0 ? (t.score / t.totalMarks) : 0), 0) / tests.length : 0;
  const testPts = avgTestPct * 20;

  const readinessScore = Math.round(syllabusPts + consistPts + accPts + revPts + testPts);

  // ── Weak Topics (Focus) ──
  const topicDetails = topics.map(t => {
    const tMins = sessions.filter(s => s.topicId === t.id).reduce((a, s) => a + (s.duration || 0), 0) + (t.practiceTimeSpent || 0);
    const strength = getTopicStrength(t, tMins);
    const nextRev = t.nextRevisionDate || getNextRevisionDate(t.lastRevisionDate, t.revisionCount || 0);
    const dl = daysUntil(nextRev);
    const subj = subjects.find(s => s.id === t.subjectId);
    return { ...t, strength, dl, subjectName: subj?.name || 'Unknown', subjectIcon: subj?.icon || '📘' };
  });

  const weakTopics = topicDetails.filter(t => t.strength.label === 'Weak').sort((a, b) => a.strength.s - b.strength.s).slice(0, 5);

  // ── Study Recommendations ──
  const recs = [];
  
  // 1. Priority: Due Revisions
  const dueRevisions = topicDetails.filter(t => t.dl !== null && t.dl <= 0);
  if (dueRevisions.length > 0) {
    const t = dueRevisions[0];
    recs.push({ title: 'Revise Overdue Topic', desc: `${t.subjectIcon} ${t.subjectName}: ${t.name}`, action: 'Revision Due', color: 'var(--warning-500)', link: '#/topics/' + t.subjectId });
  }

  // 2. Priority: Weak Topics
  if (weakTopics.length > 0) {
    const t = weakTopics[0];
    recs.push({ title: 'Strengthen Weak Topic', desc: `${t.subjectIcon} ${t.subjectName}: ${t.name}`, action: 'Low Accuracy/Time', color: 'var(--danger-500)', link: '#/topics/' + t.subjectId });
  }

  // 3. Priority: Lowest Hours Subject
  const subjectMins = {};
  sessions.forEach(s => { if (s.subjectId) subjectMins[s.subjectId] = (subjectMins[s.subjectId] || 0) + (s.duration || 0); });
  if (subjects.length > 0) {
    const lowestSubj = [...subjects].sort((a, b) => (subjectMins[a.id] || 0) - (subjectMins[b.id] || 0))[0];
    recs.push({ title: 'Study Subject', desc: `${lowestSubj.icon || '📘'} ${lowestSubj.name}`, action: 'Least Studied', color: 'var(--primary-500)', link: '#/topics/' + lowestSubj.id });
  }

  // 4. Priority: Practice Questions
  const needsPractice = topicDetails.filter(t => t.status === 'completed' && (!t.questionsAttempted || t.questionsAttempted < 20));
  if (needsPractice.length > 0 && recs.length < 4) {
    const t = needsPractice[0];
    recs.push({ title: 'Practice Questions', desc: `${t.subjectIcon} ${t.subjectName}: ${t.name}`, action: 'Low Practice', color: 'var(--accent-500)', link: '#/topics/' + t.subjectId });
  }

  // ── Syllabus Completion Predictor ──
  const firstCompleted = completedList.length > 0 ? new Date(Math.min(...completedList.map(t => new Date(t.createdAt).getTime()))) : null;
  let predictionText = "Complete a few topics to see prediction.";
  let predictedDays = null;
  if (firstCompleted && completedList.length >= 3) {
    const daysSinceFirst = Math.max(1, Math.round((now - firstCompleted) / 86400000));
    const speed = completedList.length / daysSinceFirst; // topics per day
    const remaining = topics.length - completedList.length;
    if (speed > 0 && remaining > 0) {
      predictedDays = Math.ceil(remaining / speed);
      predictionText = `At current pace (${speed.toFixed(1)}/day), syllabus completes in ~<strong style="color:var(--accent-500)">${predictedDays} days</strong>.`;
    } else if (remaining === 0) {
      predictionText = "Syllabus 100% completed! 🎉";
    }
  }

  // ── Smart Revision Queue (Global) ──
  // All topics that are completed and have a nextRevisionDate
  const revisionQueue = topicDetails
    .filter(t => t.status === 'completed' || t.status === 'revision')
    .filter(t => t.nextRevisionDate || t.lastRevisionDate)
    .sort((a, b) => {
      const d1 = new Date(a.nextRevisionDate || getNextRevisionDate(a.lastRevisionDate, a.revisionCount||0));
      const d2 = new Date(b.nextRevisionDate || getNextRevisionDate(b.lastRevisionDate, b.revisionCount||0));
      return d1 - d2;
    })
    .slice(0, 5); // Take top 5 closest revisions

  // ── Goal Milestones (Badges) ──
  const totalMinsEver = sessions.reduce((a, s) => a + (s.duration || 0), 0);
  const totalHoursEver = Math.floor(totalMinsEver / 60);
  const totalQsEver = topics.reduce((a, t) => a + (t.questionsAttempted || 0) + (t.pyqsAttempted || 0), 0);

  const milestones = [
    { title: 'Bronze Student', desc: '50h Studied', val: 50, curr: totalHoursEver, icon: '🥉' },
    { title: 'Silver Student', desc: '100h Studied', val: 100, curr: totalHoursEver, icon: '🥈' },
    { title: 'Gold Student', desc: '250h Studied', val: 250, curr: totalHoursEver, icon: '🥇' },
    { title: 'Problem Solver', desc: '100 Qs Solved', val: 100, curr: totalQsEver, icon: '🎯' },
    { title: 'Test Master', desc: '500 Qs Solved', val: 500, curr: totalQsEver, icon: '🔥' },
  ];

  // ── HTML ──
  const html = `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:var(--space-md)">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">Intelligent insights for your GATE prep.</p>
      </div>
      <div style="display:flex; gap:var(--space-sm);">
        <button class="btn btn-secondary" onclick="location.hash='/reflection'">📝 Daily Reflection</button>
        <button class="btn btn-primary" onclick="location.hash='/timer?mode=focus'">🎯 Focus Mode</button>
      </div>
    </div>

    <!-- ── Exam Readiness & Predictor ── -->
    <div class="card" style="margin-bottom: var(--space-xl); background: linear-gradient(to right, var(--bg-card), rgba(99,102,241,0.05)); border-color: rgba(99,102,241,0.2);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-md); flex-wrap:wrap; gap:var(--space-md)">
        <div>
          <div style="font-size:var(--text-xs); color:var(--text-tertiary); text-transform:uppercase; font-weight:700; letter-spacing:0.05em">Exam Readiness Score</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: var(--text-primary); line-height: 1.2; margin-bottom: 4px;">
            ${readinessScore} <span style="font-size:1rem; color:var(--text-tertiary); font-weight:500">/ 100</span>
          </div>
          <div style="font-size:var(--text-xs); color:var(--text-secondary); background:var(--bg-tertiary); padding:4px 8px; border-radius:12px; display:inline-block;">
            ⏳ ${predictionText}
          </div>
        </div>
        <div style="display:flex; gap:var(--space-lg); text-align:right; flex-wrap:wrap;">
          <div><div style="font-size:var(--text-xs); color:var(--text-tertiary);">Syllabus</div><div style="font-weight:600">${Math.round(syllabusPts)}/25</div></div>
          <div><div style="font-size:var(--text-xs); color:var(--text-tertiary);">Consistency</div><div style="font-weight:600">${Math.round(consistPts)}/20</div></div>
          <div><div style="font-size:var(--text-xs); color:var(--text-tertiary);">Accuracy</div><div style="font-weight:600">${Math.round(accPts)}/20</div></div>
          <div><div style="font-size:var(--text-xs); color:var(--text-tertiary);">Revision</div><div style="font-weight:600">${Math.round(revPts)}/15</div></div>
          <div><div style="font-size:var(--text-xs); color:var(--text-tertiary);">Tests</div><div style="font-weight:600">${Math.round(testPts)}/20</div></div>
        </div>
      </div>
      <div class="progress-bar" style="height:12px; border-radius:6px;">
        <div class="progress-fill" style="width: ${readinessScore}%; background: ${readinessScore >= 80 ? 'var(--accent-500)' : readinessScore >= 50 ? 'var(--warning-500)' : 'var(--danger-500)'}"></div>
      </div>
    </div>

    <!-- ── Goal Milestones (Badges) ── -->
    <div style="display:flex; gap:var(--space-sm); overflow-x:auto; padding-bottom:var(--space-sm); margin-bottom:var(--space-xl);">
      ${milestones.map(m => {
        const achieved = m.curr >= m.val;
        return `
        <div style="flex-shrink:0; width:120px; background:var(--bg-card); border:1px solid ${achieved?'var(--primary-500)':'var(--border-color)'}; border-radius:var(--radius-md); padding:var(--space-md); text-align:center; opacity:${achieved?'1':'0.5'}">
          <div style="font-size:2rem; margin-bottom:4px; filter:${achieved?'none':'grayscale(100%)'}">${m.icon}</div>
          <div style="font-size:var(--text-xs); font-weight:700; color:${achieved?'var(--primary-400)':'var(--text-secondary)'}">${m.title}</div>
          <div style="font-size:10px; color:var(--text-tertiary)">${m.curr}/${m.val}</div>
        </div>
        `;
      }).join('')}
    </div>

    <!-- ── Study Recommendations ── -->
    <h2 class="section-heading-sm" style="margin-bottom:var(--space-sm); font-size:var(--text-sm); color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em">What to study next</h2>
    <div class="recommendation-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:var(--space-md); margin-bottom:var(--space-xl);">
      ${recs.map(r => `
        <a href="${r.link}" class="card rec-card hover-lift" style="text-decoration:none; padding:var(--space-md); border-top: 3px solid ${r.color}">
          <div style="font-size:var(--text-xs); color:${r.color}; font-weight:700; margin-bottom:4px;">${r.action}</div>
          <div style="font-weight:600; font-size:var(--text-base); color:var(--text-primary); margin-bottom:2px;">${r.title}</div>
          <div style="font-size:var(--text-sm); color:var(--text-secondary); line-height:1.3;">${r.desc}</div>
        </a>
      `).join('')}
    </div>

    <div class="dashboard-bottom-row" style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-xl)">
      
      <!-- ── Smart Revision Queue & Focus Topics ── -->
      <div style="display:flex; flex-direction:column; gap:var(--space-xl);">
        
        <div class="card">
          <div class="card-header">
            <div class="card-title">🔄 Global Revision Queue</div>
          </div>
          <div class="weak-topics-list">
            ${revisionQueue.length === 0 ? '<div class="empty-state"><div class="empty-state-icon">✅</div><p class="empty-state-text">No revisions pending.</p></div>' :
              revisionQueue.map(t => {
                const badge = revisionBadge(t.dl);
                return `
                <div style="padding:var(--space-sm) 0; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <div style="font-size:var(--text-xs); color:var(--text-tertiary)">${t.subjectIcon} ${t.subjectName}</div>
                    <div style="font-weight:500; font-size:var(--text-sm)">${t.name}</div>
                  </div>
                  <div style="display:flex; align-items:center; gap:var(--space-sm);">
                    ${badge}
                    <button class="btn btn-sm btn-secondary" onclick="location.hash='/topics/${t.subjectId}'">Go</button>
                  </div>
                </div>`;
              }).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">⚠️ Focus Topics (Weak)</div>
          </div>
          <div class="weak-topics-list">
            ${weakTopics.length === 0 ? '<div class="empty-state"><div class="empty-state-icon">✅</div><p class="empty-state-text">No weak topics! Good job.</p></div>' :
              weakTopics.map(t => {
                const acc = t.questionsAttempted > 0 ? Math.round((t.correctAnswers / t.questionsAttempted)*100) : null;
                return `
                <div style="padding:var(--space-sm) 0; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <div style="font-size:var(--text-xs); color:var(--text-tertiary)">${t.subjectIcon} ${t.subjectName}</div>
                    <div style="font-weight:500; font-size:var(--text-sm)">${t.name}</div>
                    <div style="font-size:var(--text-xs); color:var(--text-tertiary); margin-top:2px;">
                      ${t.questionsAttempted > 0 ? `Acc: ${acc}% · ` : ''}Rev: ${t.revisionCount||0}
                    </div>
                  </div>
                  <button class="btn btn-sm btn-secondary" onclick="location.hash='/topics/${t.subjectId}'">Study</button>
                </div>`;
              }).join('')}
          </div>
        </div>

      </div>

      <!-- ── Quick Overview ── -->
      <div>
        <div class="grid-2 dashboard-stats" style="margin-bottom:var(--space-md);">
          <div class="stat-card" style="--stat-accent: var(--primary-500)">
            <div class="stat-info">
              <div class="stat-label">Today's Study</div>
              <div class="stat-value">${formatDuration(todayMins)}</div>
            </div>
          </div>
          <div class="stat-card" style="--stat-accent: #ec4899">
            <div class="stat-info">
              <div class="stat-label">Study Streak</div>
              <div class="stat-value">${streak} days</div>
            </div>
          </div>
        </div>
        
        <div class="grid-2 dashboard-stats">
          <div class="stat-card" style="--stat-accent: var(--warning-500)">
            <div class="stat-info">
              <div class="stat-label">Total Hours Built</div>
              <div class="stat-value">${totalHoursEver} h</div>
            </div>
          </div>
          <div class="stat-card" style="--stat-accent: var(--accent-500)">
            <div class="stat-info">
              <div class="stat-label">Total Questions</div>
              <div class="stat-value">${totalQsEver}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return { html, init: () => {} };
}
