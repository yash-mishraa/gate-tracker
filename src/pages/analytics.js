/* ========================================
   GATE Tracker — Analytics Dashboard (Enhanced)
   Weekly/Monthly reports, study streak, charts
   ======================================== */

import { getAll, formatDuration, todayStr, formatDate } from '../db.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

function getMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

function calculateStreak(dayMins) {
  const today = todayStr();
  const dates = Object.keys(dayMins).filter(d => dayMins[d] > 0).sort().reverse();
  if (dates.length === 0) return { current: 0, longest: 0 };

  // Current streak
  let current = 0;
  let checkDate = new Date(today + 'T00:00:00');
  // If no study today, start from yesterday
  if (!dayMins[today] || dayMins[today] === 0) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  while (true) {
    const ds = checkDate.toISOString().slice(0, 10);
    if (dayMins[ds] && dayMins[ds] > 0) {
      current++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Longest streak
  let longest = 0, streak = 0;
  const allDates = Object.keys(dayMins).filter(d => dayMins[d] > 0).sort();
  for (let i = 0; i < allDates.length; i++) {
    if (i === 0) { streak = 1; }
    else {
      const prev = new Date(allDates[i - 1] + 'T00:00:00');
      const curr = new Date(allDates[i] + 'T00:00:00');
      const diff = Math.round((curr - prev) / 86400000);
      streak = diff === 1 ? streak + 1 : 1;
    }
    longest = Math.max(longest, streak);
  }

  return { current, longest };
}

function getStreakMilestone(days) {
  const milestones = [7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
  for (const m of milestones) {
    if (days < m) return { next: m, remaining: m - days };
  }
  return { next: null, remaining: 0 };
}

export async function analyticsPage() {
  const sessions = await getAll('studySessions');
  const subjects = await getAll('subjects');
  const topics = await getAll('topics');
  const tests = await getAll('testScores');
  const now = new Date();
  const today = todayStr();

  // ── Basic stats ──
  const totalMins = sessions.reduce((a, s) => a + (s.duration || 0), 0);
  const dayMins = {};
  sessions.forEach(s => { dayMins[s.date] = (dayMins[s.date] || 0) + (s.duration || 0); });
  const totalDays = Object.keys(dayMins).filter(d => dayMins[d] > 0).length;
  const avgDaily = totalDays > 0 ? Math.round(totalMins / totalDays) : 0;
  const bestDay = Object.entries(dayMins).sort((a, b) => b[1] - a[1])[0];

  // ── Streak ──
  const streak = calculateStreak(dayMins);
  const milestone = getStreakMilestone(streak.current);

  // ── Weekly report (current week) ──
  const weekStart = getMonday(today);
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    weekDates.push(d.toISOString().slice(0, 10));
  }
  const weekMins = weekDates.reduce((a, d) => a + (dayMins[d] || 0), 0);
  const weekTopicsCompleted = topics.filter(t => {
    if (t.status !== 'completed') return false;
    const created = t.createdAt?.slice(0, 10) || '';
    return weekDates.includes(created);
  }).length;
  const weekQuestions = topics.reduce((a, t) => a + (t.questionsSolved || 0), 0); // total questions
  const weekConsistency = weekDates.filter(d => (dayMins[d] || 0) > 0).length;

  // Subject distribution this week
  const weekSessions = sessions.filter(s => weekDates.includes(s.date));
  const weekSubjMins = {};
  weekSessions.forEach(s => {
    if (s.subjectId) weekSubjMins[s.subjectId] = (weekSubjMins[s.subjectId] || 0) + (s.duration || 0);
  });

  // ── Monthly report ──
  const monthStart = today.slice(0, 8) + '01';
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthDates = [];
  for (let i = 0; i < daysInMonth; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), i + 1);
    monthDates.push(d.toISOString().slice(0, 10));
  }
  const monthMins = monthDates.reduce((a, d) => a + (dayMins[d] || 0), 0);
  const monthStudyDays = monthDates.filter(d => (dayMins[d] || 0) > 0).length;
  const monthAvgDaily = monthStudyDays > 0 ? Math.round(monthMins / monthStudyDays) : 0;
  const totalTopics = topics.length;
  const completedTopics = topics.filter(t => t.status === 'completed').length;
  const syllabusPercent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  // ── Subject hours (all time) ──
  const subjectData = subjects.map(s => {
    const mins = sessions.filter(ss => ss.subjectId === s.id).reduce((a, ss) => a + (ss.duration || 0), 0);
    return { ...s, mins };
  }).filter(s => s.mins > 0).sort((a, b) => b.mins - a.mins);

  // ── Last 30 days line chart data ──
  const lineLabels = [], lineData = [];
  for (let i = 29; i >= 0; i--) {
    const dt = new Date(now);
    dt.setDate(now.getDate() - i);
    const ds = dt.toISOString().slice(0, 10);
    lineLabels.push(dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
    lineData.push(Math.round((dayMins[ds] || 0) / 60 * 10) / 10);
  }

  // ── Weekly consistency (last 8 weeks) ──
  const weeklyConsistLabels = [], weeklyConsistData = [];
  for (let w = 7; w >= 0; w--) {
    const wStart = new Date(now);
    wStart.setDate(now.getDate() - (w * 7 + (now.getDay() === 0 ? 6 : now.getDay() - 1)));
    const wDates = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(wStart);
      dt.setDate(wStart.getDate() + d);
      wDates.push(dt.toISOString().slice(0, 10));
    }
    const count = wDates.filter(d => (dayMins[d] || 0) > 0).length;
    weeklyConsistLabels.push(`W${8 - w}`);
    weeklyConsistData.push(count);
  }

  // ── Topic completion rate ──
  const topicStatusCounts = {
    'Not Started': topics.filter(t => !t.status || t.status === 'not-started').length,
    'In Progress': topics.filter(t => t.status === 'in-progress').length,
    'Completed': topics.filter(t => t.status === 'completed').length,
    'Revision': topics.filter(t => t.status === 'revision').length,
  };

  // ── Heatmap (12 weeks) ──
  const heatmapWeeks = [];
  for (let w = 11; w >= 0; w--) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(now);
      dt.setDate(now.getDate() - (w * 7 + (6 - d)));
      const ds = dt.toISOString().slice(0, 10);
      week.push({ date: ds, mins: dayMins[ds] || 0 });
    }
    heatmapWeeks.push(week);
  }

  function heatLevel(mins) {
    if (mins === 0) return 'heat-0';
    if (mins < 30) return 'heat-1';
    if (mins < 60) return 'heat-2';
    if (mins < 120) return 'heat-3';
    return 'heat-4';
  }

  // ── Productivity Insights ──
  // 1. Most effective study time
  const hourCounts = new Array(24).fill(0);
  sessions.forEach(s => {
    if (s.createdAt) {
      const hour = new Date(s.createdAt).getHours();
      hourCounts[hour] += (s.duration || 0);
    }
  });
  let bestHour = 0;
  let maxHourMins = 0;
  for (let i = 0; i < 24; i++) {
    const blockMins = hourCounts[i] + hourCounts[(i + 1) % 24] + hourCounts[(i + 2) % 24];
    if (blockMins > maxHourMins) {
      maxHourMins = blockMins;
      bestHour = i;
    }
  }
  const endHour = (bestHour + 3) % 24;
  const ampm = h => h >= 12 ? (h === 12 ? '12 PM' : `${h - 12} PM`) : (h === 0 ? '12 AM' : `${h} AM`);
  const bestTimeStr = maxHourMins > 0 ? `${ampm(bestHour)} - ${ampm(endHour)}` : 'Not enough data';

  // 2. Most studied subject
  const mostStudiedSubj = subjectData.length > 0 ? subjectData[0] : null;

  // 3. Weakest Subject
  // Calculate average strength score per subject using the topic strength algorithm
  const subjScores = {};
  topics.forEach(t => {
    // Basic accuracy calculation
    let score = 50;
    const acc = t.questionsAttempted > 0 ? (t.correctAnswers / t.questionsAttempted) * 100 : null;
    if (acc !== null) {
      if (acc >= 80) score += 20;
      else if (acc >= 60) score += 5;
      else if (acc < 40) score -= 20;
      else score -= 10;
    }
    if (acc === null && t.pyqsAttempted > 0) {
       const pyqAcc = (t.pyqsCorrect / t.pyqsAttempted) * 100;
       if (pyqAcc >= 80) score += 20;
       else if (pyqAcc >= 60) score += 5;
       else if (pyqAcc < 40) score -= 20;
       else score -= 10;
    }
    if (!subjScores[t.subjectId]) subjScores[t.subjectId] = { total: 0, count: 0 };
    subjScores[t.subjectId].total += score;
    subjScores[t.subjectId].count += 1;
  });
  
  let weakestSubjId = null;
  let lowestAvgScore = Infinity;
  Object.keys(subjScores).forEach(sid => {
    const avg = subjScores[sid].total / subjScores[sid].count;
    if (avg < lowestAvgScore) {
      lowestAvgScore = avg;
      weakestSubjId = Number(sid);
    }
  });
  const weakestSubj = subjects.find(s => s.id === weakestSubjId);

  const html = `
    <div class="page-header">
      <h1 class="page-title">Analytics Dashboard</h1>
      <p class="page-subtitle">Deep insights into your GATE preparation</p>
    </div>

    <!-- ── Productivity Insights ── -->
    <div class="grid-3" style="gap:var(--space-md); margin-bottom:var(--space-xl);">
      <div class="card" style="padding:var(--space-md); background: linear-gradient(135deg, rgba(99,102,241,0.1), rgba(99,102,241,0.02)); border-color:rgba(99,102,241,0.2)">
        <div style="font-size:2rem; margin-bottom:8px">⏰</div>
        <div style="font-size:var(--text-xs); color:var(--text-tertiary); text-transform:uppercase; font-weight:700">Peak Productivity</div>
        <div style="font-size:var(--text-base); font-weight:600; color:var(--text-primary); margin-top:2px;">
          ${bestTimeStr}
        </div>
        <div style="font-size:var(--text-xs); color:var(--text-secondary); margin-top:4px;">You study most effectively during this block.</div>
      </div>
      
      <div class="card" style="padding:var(--space-md); background: linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.02)); border-color:rgba(16,185,129,0.2)">
        <div style="font-size:2rem; margin-bottom:8px">📚</div>
        <div style="font-size:var(--text-xs); color:var(--text-tertiary); text-transform:uppercase; font-weight:700">Most Studied</div>
        <div style="font-size:var(--text-base); font-weight:600; color:var(--text-primary); margin-top:2px;">
          ${mostStudiedSubj ? mostStudiedSubj.name : 'Not enough data'}
        </div>
        <div style="font-size:var(--text-xs); color:var(--text-secondary); margin-top:4px;">You spend the most time on this subject.</div>
      </div>

      <div class="card" style="padding:var(--space-md); background: linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.02)); border-color:rgba(239,68,68,0.2)">
        <div style="font-size:2rem; margin-bottom:8px">⚠️</div>
        <div style="font-size:var(--text-xs); color:var(--text-tertiary); text-transform:uppercase; font-weight:700">Weakest Subject</div>
        <div style="font-size:var(--text-base); font-weight:600; color:var(--text-primary); margin-top:2px;">
          ${weakestSubj ? weakestSubj.name : 'Not enough data'}
        </div>
        <div style="font-size:var(--text-xs); color:var(--text-secondary); margin-top:4px;">Based on practice accuracy and topic strength.</div>
      </div>
    </div>

    <!-- ── Study Streak ── -->
    <div class="streak-banner">
      <div class="streak-main">
        <span class="streak-flame">🔥</span>
        <div>
          <div class="streak-count">${streak.current} Day${streak.current !== 1 ? 's' : ''}</div>
          <div class="streak-subtext">Current Study Streak</div>
        </div>
      </div>
      <div class="streak-stats">
        <div class="streak-stat">
          <span class="streak-stat-val">🏆 ${streak.longest}</span>
          <span class="streak-stat-lbl">Longest Streak</span>
        </div>
        <div class="streak-stat">
          <span class="streak-stat-val">📚 ${totalDays}</span>
          <span class="streak-stat-lbl">Total Study Days</span>
        </div>
        ${milestone.next ? `<div class="streak-stat">
          <span class="streak-stat-val">🎯 ${milestone.remaining}d</span>
          <span class="streak-stat-lbl">to ${milestone.next}-day milestone</span>
        </div>` : `<div class="streak-stat">
          <span class="streak-stat-val">⭐</span>
          <span class="streak-stat-lbl">Legend!</span>
        </div>`}
      </div>
    </div>

    <!-- ── Overview Stats ── -->
    <div class="grid-4 dashboard-stats">
      <div class="stat-card" style="--stat-accent: var(--primary-500)">
        <div class="stat-icon" style="background: rgba(99,102,241,0.15); color: var(--primary-400)">📚</div>
        <div class="stat-info"><div class="stat-label">Total Study</div><div class="stat-value">${formatDuration(totalMins)}</div></div>
      </div>
      <div class="stat-card" style="--stat-accent: var(--accent-500)">
        <div class="stat-icon" style="background: rgba(16,185,129,0.15); color: var(--accent-400)">📈</div>
        <div class="stat-info"><div class="stat-label">Avg / Day</div><div class="stat-value">${formatDuration(avgDaily)}</div></div>
      </div>
      <div class="stat-card" style="--stat-accent: var(--warning-500)">
        <div class="stat-icon" style="background: rgba(245,158,11,0.15); color: var(--warning-400)">🏆</div>
        <div class="stat-info"><div class="stat-label">Best Day</div><div class="stat-value">${bestDay ? formatDuration(bestDay[1]) : '—'}</div></div>
      </div>
      <div class="stat-card" style="--stat-accent: #ec4899">
        <div class="stat-icon" style="background: rgba(236,72,153,0.15); color: #f472b6">✅</div>
        <div class="stat-info"><div class="stat-label">Syllabus</div><div class="stat-value">${syllabusPercent}%</div></div>
      </div>
    </div>

    <!-- ── Weekly Report ── -->
    <div class="report-section">
      <h2 class="section-heading">📅 This Week's Report</h2>
      <div class="report-grid">
        <div class="report-stat-card">
          <span class="report-stat-icon">⏱</span>
          <div class="report-stat-val">${formatDuration(weekMins)}</div>
          <div class="report-stat-lbl">Study Hours</div>
        </div>
        <div class="report-stat-card">
          <span class="report-stat-icon">✅</span>
          <div class="report-stat-val">${weekTopicsCompleted}</div>
          <div class="report-stat-lbl">Topics Completed</div>
        </div>
        <div class="report-stat-card">
          <span class="report-stat-icon">✏️</span>
          <div class="report-stat-val">${weekQuestions}</div>
          <div class="report-stat-lbl">Questions Solved</div>
        </div>
        <div class="report-stat-card">
          <span class="report-stat-icon">📊</span>
          <div class="report-stat-val">${weekConsistency}/7</div>
          <div class="report-stat-lbl">Days Active</div>
        </div>
      </div>
      ${Object.keys(weekSubjMins).length > 0 ? `
      <div class="card" style="margin-top:var(--space-md)">
        <div class="card-header"><div class="card-title">Subject Distribution This Week</div></div>
        <div class="chart-container" style="height:220px"><canvas id="weekSubjChart"></canvas></div>
      </div>` : ''}
    </div>

    <!-- ── Monthly Report ── -->
    <div class="report-section">
      <h2 class="section-heading">📆 This Month's Report</h2>
      <div class="report-grid">
        <div class="report-stat-card">
          <span class="report-stat-icon">⏱</span>
          <div class="report-stat-val">${formatDuration(monthMins)}</div>
          <div class="report-stat-lbl">Total Study Hours</div>
        </div>
        <div class="report-stat-card">
          <span class="report-stat-icon">📈</span>
          <div class="report-stat-val">${formatDuration(monthAvgDaily)}</div>
          <div class="report-stat-lbl">Avg Daily Study</div>
        </div>
        <div class="report-stat-card">
          <span class="report-stat-icon">🎓</span>
          <div class="report-stat-val">${syllabusPercent}%</div>
          <div class="report-stat-lbl">Syllabus Complete</div>
        </div>
        <div class="report-stat-card">
          <span class="report-stat-icon">📅</span>
          <div class="report-stat-val">${monthStudyDays}/${daysInMonth}</div>
          <div class="report-stat-lbl">Days Studied</div>
        </div>
      </div>
    </div>

    <!-- ── Charts ── -->
    <div class="analytics-charts-row">
      <div class="card">
        <div class="card-header"><div class="card-title">Daily Study Hours (Last 30 Days)</div></div>
        <div class="chart-container" style="height:280px"><canvas id="dailyLineChart"></canvas></div>
      </div>
    </div>

    <div class="analytics-charts-grid">
      <div class="card">
        <div class="card-header"><div class="card-title">Weekly Consistency (Last 8 Weeks)</div></div>
        <div class="chart-container" style="height:250px"><canvas id="weeklyConsistChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Topic Completion Rate</div></div>
        <div class="chart-container" style="height:250px"><canvas id="topicPieChart"></canvas></div>
      </div>
    </div>

    <div class="analytics-charts-row" style="margin-top: var(--space-md);">
      <div class="card">
        <div class="card-header"><div class="card-title">Subject-wise Study Hours</div></div>
        <div class="chart-container" style="height:${Math.max(220, subjectData.length * 36)}px"><canvas id="subjectBarChart"></canvas></div>
      </div>
    </div>

    <!-- Heatmap -->
    <div class="card" style="margin-top: var(--space-md);">
      <div class="card-header"><div class="card-title">Study Heatmap (12 Weeks)</div></div>
      <div class="heatmap-container">
        <div class="heatmap-grid">
          ${heatmapWeeks.map(week =>
            `<div class="heatmap-col">${week.map(d =>
              `<div class="heatmap-cell ${heatLevel(d.mins)}" title="${d.date}: ${d.mins}m"></div>`
            ).join('')}</div>`
          ).join('')}
        </div>
        <div class="heatmap-legend">
          <span>Less</span>
          <div class="heatmap-cell heat-0"></div>
          <div class="heatmap-cell heat-1"></div>
          <div class="heatmap-cell heat-2"></div>
          <div class="heatmap-cell heat-3"></div>
          <div class="heatmap-cell heat-4"></div>
          <span>More</span>
        </div>
      </div>
    </div>
  `;

  return {
    html,
    init: () => {
      const chartColors = {
        grid: 'rgba(255,255,255,0.05)',
        tick: 'rgba(255,255,255,0.4)',
      };

      // Daily line chart
      const lineCtx = document.getElementById('dailyLineChart');
      if (lineCtx) {
        new Chart(lineCtx, {
          type: 'line',
          data: {
            labels: lineLabels,
            datasets: [{
              label: 'Hours',
              data: lineData,
              borderColor: 'rgba(99, 102, 241, 1)',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              fill: true,
              tension: 0.4,
              pointRadius: 2,
              pointHoverRadius: 5,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, grid: { color: chartColors.grid }, ticks: { color: chartColors.tick } },
              x: { grid: { display: false }, ticks: { color: chartColors.tick, maxTicksLimit: 10 } },
            }
          }
        });
      }

      // Weekly consistency bar chart
      const wcCtx = document.getElementById('weeklyConsistChart');
      if (wcCtx) {
        new Chart(wcCtx, {
          type: 'bar',
          data: {
            labels: weeklyConsistLabels,
            datasets: [{
              label: 'Days Active',
              data: weeklyConsistData,
              backgroundColor: weeklyConsistData.map(d => d >= 5 ? 'rgba(16,185,129,0.8)' : d >= 3 ? 'rgba(245,158,11,0.8)' : 'rgba(239,68,68,0.6)'),
              borderRadius: 6,
              borderSkipped: false,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, max: 7, grid: { color: chartColors.grid }, ticks: { color: chartColors.tick, stepSize: 1 } },
              x: { grid: { display: false }, ticks: { color: chartColors.tick } },
            }
          }
        });
      }

      // Topic pie chart
      const pieCtx = document.getElementById('topicPieChart');
      if (pieCtx && totalTopics > 0) {
        new Chart(pieCtx, {
          type: 'doughnut',
          data: {
            labels: Object.keys(topicStatusCounts),
            datasets: [{
              data: Object.values(topicStatusCounts),
              backgroundColor: ['rgba(148,163,184,0.6)', 'rgba(99,102,241,0.8)', 'rgba(16,185,129,0.8)', 'rgba(245,158,11,0.8)'],
              borderWidth: 0,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.6)', padding: 12, font: { size: 11 } } },
            }
          }
        });
      }

      // Subject bar chart
      const barCtx = document.getElementById('subjectBarChart');
      if (barCtx && subjectData.length > 0) {
        new Chart(barCtx, {
          type: 'bar',
          data: {
            labels: subjectData.map(s => s.name),
            datasets: [{
              label: 'Hours',
              data: subjectData.map(s => Math.round(s.mins / 60 * 10) / 10),
              backgroundColor: subjectData.map(s => s.color || '#6366f1'),
              borderRadius: 6,
              borderSkipped: false,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true, grid: { color: chartColors.grid }, ticks: { color: chartColors.tick } },
              y: { grid: { display: false }, ticks: { color: chartColors.tick, font: { size: 11 } } },
            }
          }
        });
      }

      // Weekly subject distribution pie
      const wsCtx = document.getElementById('weekSubjChart');
      if (wsCtx && Object.keys(weekSubjMins).length > 0) {
        const wsData = Object.entries(weekSubjMins).map(([sid, mins]) => {
          const subj = subjects.find(s => s.id === Number(sid));
          return { name: subj?.name || 'Unknown', color: subj?.color || '#6366f1', mins };
        }).sort((a, b) => b.mins - a.mins);

        new Chart(wsCtx, {
          type: 'doughnut',
          data: {
            labels: wsData.map(d => d.name),
            datasets: [{
              data: wsData.map(d => Math.round(d.mins / 60 * 10) / 10),
              backgroundColor: wsData.map(d => d.color),
              borderWidth: 0,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'right', labels: { color: 'rgba(255,255,255,0.6)', padding: 8, font: { size: 10 } } },
            }
          }
        });
      }
    }
  };
}
