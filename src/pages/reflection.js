/* ========================================
   GATE Tracker — Daily Reflection Page
   ======================================== */

import { getAll, add, put, todayStr } from '../db.js';

export async function reflectionPage() {
  const logs = await getAll('dailyLogs');
  const today = todayStr();
  const existingLog = logs.find(l => l.date === today);

  const html = `
    <div class="page-header">
      <h1 class="page-title">Daily Study Reflection</h1>
      <p class="page-subtitle">Review your progress for ${new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
    </div>

    <div class="card" style="max-width: 600px; margin: 0 auto;">
      <div class="card-header">
        <div class="card-title">${existingLog ? 'Update Reflection' : 'Save Reflection'}</div>
      </div>
      
      <div class="form-group">
        <label class="form-label">What did you study today?</label>
        <input class="form-input" id="ref-study" placeholder="e.g., Graphs, Trees, Arrays..." value="${existingLog?.studiedToday || ''}" />
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Hours Studied</label>
          <input class="form-input" id="ref-hours" type="number" step="0.5" min="0" placeholder="e.g., 4" value="${existingLog?.hoursStudied || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Topics Completed</label>
          <input class="form-input" id="ref-topics" type="number" min="0" value="${existingLog?.topicsCompleted || 0}" />
        </div>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Questions Solved</label>
          <input class="form-input" id="ref-questions" type="number" min="0" value="${existingLog?.questionsSolved || 0}" />
        </div>
        <div class="form-group">
          <label class="form-label">Difficulty Level of the Day</label>
          <select class="form-input" id="ref-difficulty">
            <option value="easy" ${existingLog?.difficulty === 'easy' ? 'selected' : ''}>Easy</option>
            <option value="medium" ${existingLog?.difficulty === 'medium' || !existingLog ? 'selected' : ''}>Medium</option>
            <option value="hard" ${existingLog?.difficulty === 'hard' ? 'selected' : ''}>Hard</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Notes / Learnings</label>
        <textarea class="form-input" id="ref-notes" rows="4" placeholder="Any key takeaways, blockers, or thoughts...">${existingLog?.notes || ''}</textarea>
      </div>

      <button class="btn btn-primary" id="save-reflection" style="width: 100%; margin-top: var(--space-md);">${existingLog ? 'Update Reflection' : 'Save Reflection'}</button>
      <div id="ref-msg" style="color:var(--accent-500); font-weight:500; text-align:center; margin-top:var(--space-md); display:none">✅ Saved successfully!</div>
    </div>
  `;

  return {
    html,
    init: () => {
      document.getElementById('save-reflection').addEventListener('click', async () => {
        const data = {
          date: todayStr(),
          studiedToday: document.getElementById('ref-study').value.trim(),
          hoursStudied: Number(document.getElementById('ref-hours').value) || 0,
          topicsCompleted: Number(document.getElementById('ref-topics').value) || 0,
          questionsSolved: Number(document.getElementById('ref-questions').value) || 0,
          difficulty: document.getElementById('ref-difficulty').value,
          notes: document.getElementById('ref-notes').value.trim(),
          createdAt: existingLog?.createdAt || new Date().toISOString()
        };

        if (existingLog) {
          data.id = existingLog.id;
          await put('dailyLogs', data);
        } else {
          await add('dailyLogs', data);
        }

        const msg = document.getElementById('ref-msg');
        msg.style.display = 'block';
        setTimeout(() => msg.style.display = 'none', 3000);
      });
    }
  };
}
