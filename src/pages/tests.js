/* ========================================
   GATE Tracker — Mock Test Tracker (Enhanced)
   Score/accuracy trends, strongest/weakest subjects
   ======================================== */

import { getAll, add, del, formatDate, todayStr, formatDuration } from '../db.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

export async function testsPage() {
  const tests = await getAll('testScores');
  const subjects = await getAll('subjects');

  const sortedTests = [...tests].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Analytics calculations
  const avgScore = tests.length > 0 ? Math.round(tests.reduce((a, t) => a + (t.totalMarks > 0 ? (t.score / t.totalMarks) * 100 : 0), 0) / tests.length) : 0;
  const avgAccuracy = tests.length > 0 ? Math.round(tests.reduce((a, t) => a + (t.accuracy || (t.totalMarks > 0 ? (t.score / t.totalMarks) * 100 : 0)), 0) / tests.length) : 0;
  const totalTime = tests.reduce((a, t) => a + (t.timeTaken || 0), 0);
  const bestScore = tests.length > 0 ? Math.max(...tests.map(t => t.totalMarks > 0 ? Math.round((t.score / t.totalMarks) * 100) : 0)) : 0;

  // Subject performance
  const subjPerf = {};
  tests.forEach(t => {
    const sid = t.subjectId;
    if (!sid) return;
    if (!subjPerf[sid]) subjPerf[sid] = { total: 0, score: 0, count: 0 };
    subjPerf[sid].total += t.totalMarks || 0;
    subjPerf[sid].score += t.score || 0;
    subjPerf[sid].count++;
  });

  let strongest = null, weakest = null;
  let strongestPct = -1, weakestPct = 101;
  Object.entries(subjPerf).forEach(([sid, data]) => {
    const pct = data.total > 0 ? Math.round((data.score / data.total) * 100) : 0;
    const subj = subjects.find(s => s.id === Number(sid));
    if (pct > strongestPct) { strongestPct = pct; strongest = subj; }
    if (pct < weakestPct) { weakestPct = pct; weakest = subj; }
  });

  // Trend data (chronological)
  const trendTests = [...tests].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const trendLabels = trendTests.map(t => formatDate(t.date));
  const trendScores = trendTests.map(t => t.totalMarks > 0 ? Math.round((t.score / t.totalMarks) * 100) : 0);
  const trendAccuracy = trendTests.map(t => t.accuracy || (t.totalMarks > 0 ? Math.round((t.score / t.totalMarks) * 100) : 0));

  // Subject-wise score bar data
  const subjBarData = Object.entries(subjPerf).map(([sid, data]) => {
    const subj = subjects.find(s => s.id === Number(sid));
    return {
      label: subj ? subj.name : 'Unknown',
      color: subj?.color || '#6366f1',
      pct: data.total > 0 ? Math.round((data.score / data.total) * 100) : 0,
      count: data.count,
    };
  }).sort((a, b) => b.pct - a.pct);

  const html = `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap: var(--space-md);">
      <div>
        <h1 class="page-title">Mock Test Tracker</h1>
        <p class="page-subtitle">${tests.length} tests logged</p>
      </div>
      <button class="btn btn-primary" id="add-test-btn">+ Log Test</button>
    </div>

    <!-- Stats strip -->
    <div class="grid-4 dashboard-stats" style="margin-bottom: var(--space-xl);">
      <div class="stat-card" style="--stat-accent: var(--primary-500)">
        <div class="stat-icon" style="background: rgba(99,102,241,0.15); color: var(--primary-400)">📊</div>
        <div class="stat-info">
          <div class="stat-label">Avg Score</div>
          <div class="stat-value">${avgScore}%</div>
        </div>
      </div>
      <div class="stat-card" style="--stat-accent: var(--accent-500)">
        <div class="stat-icon" style="background: rgba(16,185,129,0.15); color: var(--accent-400)">🎯</div>
        <div class="stat-info">
          <div class="stat-label">Best Score</div>
          <div class="stat-value">${bestScore}%</div>
        </div>
      </div>
      <div class="stat-card" style="--stat-accent: var(--warning-500)">
        <div class="stat-icon" style="background: rgba(245,158,11,0.15); color: var(--warning-400)">⏱</div>
        <div class="stat-info">
          <div class="stat-label">Total Time</div>
          <div class="stat-value">${formatDuration(totalTime)}</div>
        </div>
      </div>
      <div class="stat-card" style="--stat-accent: #ec4899">
        <div class="stat-icon" style="background: rgba(236,72,153,0.15); color: #f472b6">📝</div>
        <div class="stat-info">
          <div class="stat-label">Tests Taken</div>
          <div class="stat-value">${tests.length}</div>
        </div>
      </div>
    </div>

    <!-- Strongest / Weakest -->
    ${strongest || weakest ? `
    <div class="test-strength-row" style="margin-bottom: var(--space-xl);">
      ${strongest ? `<div class="card test-strength-card">
        <div style="font-size:var(--text-xs); color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; font-weight:600; margin-bottom:4px;">💪 Strongest Subject</div>
        <div style="font-weight:600; font-size:var(--text-base);">${strongest.icon || '📘'} ${strongest.name}</div>
        <div style="color:var(--accent-400); font-weight:700; font-size:var(--text-lg);">${strongestPct}%</div>
      </div>` : ''}
      ${weakest && weakest !== strongest ? `<div class="card test-strength-card">
        <div style="font-size:var(--text-xs); color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; font-weight:600; margin-bottom:4px;">⚠️ Weakest Subject</div>
        <div style="font-weight:600; font-size:var(--text-base);">${weakest.icon || '📘'} ${weakest.name}</div>
        <div style="color:var(--danger-400); font-weight:700; font-size:var(--text-lg);">${weakestPct}%</div>
      </div>` : ''}
    </div>` : ''}

    <!-- Charts -->
    ${tests.length >= 2 ? `
    <div class="analytics-charts-row" style="margin-bottom: var(--space-md);">
      <div class="card">
        <div class="card-header"><div class="card-title">Score & Accuracy Trend</div></div>
        <div class="chart-container" style="height:260px"><canvas id="testTrendChart"></canvas></div>
      </div>
    </div>` : ''}

    ${subjBarData.length > 0 ? `
    <div class="analytics-charts-row" style="margin-bottom: var(--space-xl);">
      <div class="card">
        <div class="card-header"><div class="card-title">Subject-wise Performance</div></div>
        <div class="chart-container" style="height:${Math.max(200, subjBarData.length * 40)}px"><canvas id="subjPerfChart"></canvas></div>
      </div>
    </div>` : ''}

    <!-- Table -->
    <div class="card">
      <div class="card-header"><div class="card-title">All Tests</div></div>
      <div class="table-scroll">
      <table class="data-table" id="tests-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Test Name</th>
            <th>Subject</th>
            <th>Score</th>
            <th>Total</th>
            <th>%</th>
            <th>Accuracy</th>
            <th>Time</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${sortedTests.length === 0 ? `<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">📝</div><p class="empty-state-text">No tests logged yet</p></div></td></tr>` :
            sortedTests.map(t => {
              const pct = t.totalMarks > 0 ? Math.round((t.score / t.totalMarks) * 100) : 0;
              const subj = subjects.find(s => s.id === t.subjectId);
              const acc = t.accuracy != null ? `${Math.round(t.accuracy)}%` : `${pct}%`;
              return `<tr>
                <td>${formatDate(t.date)}</td>
                <td style="font-weight:500">${t.testName || '—'}</td>
                <td>${subj ? `${subj.icon || '📘'} ${subj.name}` : (t.subjectName || 'General')}</td>
                <td style="font-weight:600">${t.score}</td>
                <td>${t.totalMarks}</td>
                <td><span class="badge ${pct >= 70 ? 'badge-success' : pct >= 40 ? 'badge-warning' : 'badge-danger'}">${pct}%</span></td>
                <td>${acc}</td>
                <td>${t.timeTaken ? `${t.timeTaken} min` : '—'}</td>
                <td><button class="btn-icon delete-test" data-id="${t.id}">🗑️</button></td>
              </tr>`;
            }).join('')}
        </tbody>
      </table>
      </div>
    </div>

    <!-- Add Test Modal -->
    <div class="modal-overlay" id="test-modal" style="display:none">
      <div class="modal">
        <h2 class="modal-title">Log Mock Test</h2>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Test Name</label>
            <input class="form-input" id="test-name" placeholder="e.g., GATE 2024 Mock 3" />
          </div>
          <div class="form-group">
            <label class="form-label">Date</label>
            <input class="form-input" id="test-date" type="date" value="${todayStr()}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Subject</label>
          <select class="form-input" id="test-subject">
            <option value="">General / Mixed</option>
            ${subjects.map(s => `<option value="${s.id}">${s.icon || '📘'} ${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Score</label>
            <input class="form-input" id="test-score" type="number" min="0" placeholder="65" />
          </div>
          <div class="form-group">
            <label class="form-label">Total Marks</label>
            <input class="form-input" id="test-total" type="number" min="1" placeholder="100" />
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Accuracy (%)</label>
            <input class="form-input" id="test-accuracy" type="number" min="0" max="100" placeholder="Auto-calculated" />
          </div>
          <div class="form-group">
            <label class="form-label">Time Taken (min)</label>
            <input class="form-input" id="test-time" type="number" min="0" placeholder="180" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Subjects Covered</label>
          <div class="test-subjects-checklist" id="test-subjects-checklist">
            ${subjects.map(s => `<label class="test-subj-check"><input type="checkbox" value="${s.id}" /> ${s.icon || '📘'} ${s.name}</label>`).join('')}
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancel-test">Cancel</button>
          <button class="btn btn-primary" id="save-test">Save</button>
        </div>
      </div>
    </div>
  `;

  return {
    html,
    init: () => {
      const modal = document.getElementById('test-modal');

      document.getElementById('add-test-btn').addEventListener('click', () => modal.style.display = 'flex');
      document.getElementById('cancel-test').addEventListener('click', () => modal.style.display = 'none');
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

      // Auto-calculate accuracy from score/total
      const scoreEl = document.getElementById('test-score');
      const totalEl = document.getElementById('test-total');
      const accEl = document.getElementById('test-accuracy');
      function autoAcc() {
        const s = Number(scoreEl.value);
        const t = Number(totalEl.value);
        if (t > 0 && !accEl.value) {
          accEl.placeholder = Math.round((s / t) * 100) + '%';
        }
      }
      scoreEl.addEventListener('input', autoAcc);
      totalEl.addEventListener('input', autoAcc);

      document.getElementById('save-test').addEventListener('click', async () => {
        const score = Number(scoreEl.value);
        const totalMarks = Number(totalEl.value);
        if (!totalMarks) return;

        const coveredSubjects = [];
        document.querySelectorAll('#test-subjects-checklist input:checked').forEach(cb => {
          coveredSubjects.push(Number(cb.value));
        });

        await add('testScores', {
          testName: document.getElementById('test-name').value.trim(),
          date: document.getElementById('test-date').value || todayStr(),
          subjectId: Number(document.getElementById('test-subject').value) || null,
          subjectName: document.getElementById('test-subject').selectedOptions[0]?.textContent || '',
          score,
          totalMarks,
          accuracy: Number(accEl.value) || (totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0),
          timeTaken: Number(document.getElementById('test-time').value) || null,
          subjectsCovered: coveredSubjects,
          createdAt: new Date().toISOString(),
        });
        location.hash = '/tests';
        location.reload();
      });

      // Delete
      document.querySelectorAll('.delete-test').forEach(btn => {
        btn.addEventListener('click', async () => {
          await del('testScores', Number(btn.dataset.id));
          location.hash = '/tests';
          location.reload();
        });
      });

      // Score & Accuracy trend chart
      const trendEl = document.getElementById('testTrendChart');
      if (trendEl && trendTests.length >= 2) {
        new Chart(trendEl, {
          type: 'line',
          data: {
            labels: trendLabels,
            datasets: [
              {
                label: 'Score %',
                data: trendScores,
                borderColor: 'rgba(99, 102, 241, 1)',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
              },
              {
                label: 'Accuracy %',
                data: trendAccuracy,
                borderColor: 'rgba(16, 185, 129, 1)',
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                fill: false,
                tension: 0.3,
                pointRadius: 3,
                pointHoverRadius: 5,
                borderDash: [5, 5],
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 } } },
            },
            scales: {
              y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.4)', callback: v => v + '%' } },
              x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.4)' } },
            }
          }
        });
      }

      // Subject performance bar chart
      const subjEl = document.getElementById('subjPerfChart');
      if (subjEl && subjBarData.length > 0) {
        new Chart(subjEl, {
          type: 'bar',
          data: {
            labels: subjBarData.map(s => s.label),
            datasets: [{
              label: 'Avg %',
              data: subjBarData.map(s => s.pct),
              backgroundColor: subjBarData.map(s => s.color),
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
              x: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.4)', callback: v => v + '%' } },
              y: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } } },
            }
          }
        });
      }
    }
  };
}
