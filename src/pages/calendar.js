/* ========================================
   GATE Tracker — Calendar Page
   ======================================== */

import { getAll, todayStr, formatDate, formatDuration } from '../db.js';

export async function calendarPage() {
  const sessions = await getAll('studySessions');
  const tests = await getAll('testScores');
  const topics = await getAll('topics');
  const subjects = await getAll('subjects');

  // Pre-process events by date
  const eventsByDate = {};
  
  function addEvent(dateStr, type, detail) {
    if (!eventsByDate[dateStr]) eventsByDate[dateStr] = [];
    eventsByDate[dateStr].push({ type, detail });
  }

  // 1. Study Sessions
  sessions.forEach(s => {
    if (s.date && s.duration > 0) {
      addEvent(s.date, 'session', `Studied ${formatDuration(s.duration)}`);
    }
  });

  // 2. Tests
  tests.forEach(t => {
    if (t.date) {
      addEvent(t.date, 'test', `Mock Test: ${t.testName} (${t.score}/${t.totalMarks})`);
    }
  });

  // 3. Topics Completed
  topics.forEach(t => {
    if (t.status === 'completed' && t.createdAt) {
      addEvent(t.createdAt.slice(0, 10), 'topic', `Completed: ${t.name}`);
    }
    // Revision Reminders
    const nextRev = t.nextRevisionDate;
    if (nextRev) {
      addEvent(nextRev, 'revision', `Revision Due: ${t.name}`);
    }
  });

  let currentDate = new Date(); // Start at current month

  function renderCalendar(year, month) {
    const today = todayStr();
    const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Adjust so Monday is first (optional, standard JS is Sunday first)
    const startOffset = firstDay === 0 ? 6 : firstDay - 1; 

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    let calHtml = `
      <div class="calendar-header">
        <button class="btn btn-sm btn-secondary" id="cal-prev">&lt;</button>
        <span class="calendar-title">${monthNames[month]} ${year}</span>
        <button class="btn btn-sm btn-secondary" id="cal-next">&gt;</button>
      </div>
      <div class="calendar-grid">
        <div class="cal-day-header">Mon</div>
        <div class="cal-day-header">Tue</div>
        <div class="cal-day-header">Wed</div>
        <div class="cal-day-header">Thu</div>
        <div class="cal-day-header">Fri</div>
        <div class="cal-day-header">Sat</div>
        <div class="cal-day-header">Sun</div>
    `;

    // Empty slots before first day
    for (let i = 0; i < startOffset; i++) {
      calHtml += `<div class="cal-cell empty"></div>`;
    }

    // Days in month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = dateStr === today ? 'today' : '';
      const dayEvents = eventsByDate[dateStr] || [];
      
      const dotsHtml = dayEvents.length > 0 ? `
        <div class="cal-dots">
          ${dayEvents.some(e => e.type==='session') ? '<span class="cal-dot session-dot" title="Study Session"></span>' : ''}
          ${dayEvents.some(e => e.type==='test') ? '<span class="cal-dot test-dot" title="Test Taken"></span>' : ''}
          ${dayEvents.some(e => e.type==='topic') ? '<span class="cal-dot topic-dot" title="Topic Completed"></span>' : ''}
          ${dayEvents.some(e => e.type==='revision') ? '<span class="cal-dot revision-dot" title="Revision Due"></span>' : ''}
        </div>
      ` : '';

      calHtml += `
        <div class="cal-cell ${isToday}" data-date="${dateStr}">
          <span class="cal-date-num">${d}</span>
          ${dotsHtml}
        </div>
      `;
    }

    calHtml += `</div>`;
    return calHtml;
  }

  const html = `
    <div class="page-header">
      <h1 class="page-title">Study Calendar</h1>
      <p class="page-subtitle">Track your daily study events, tests, and upcoming revisions</p>
    </div>

    <!-- Instructions / Legend -->
    <div class="cal-legend">
      <div class="legend-item"><span class="cal-dot session-dot"></span> Study Session</div>
      <div class="legend-item"><span class="cal-dot test-dot"></span> Mock Test</div>
      <div class="legend-item"><span class="cal-dot topic-dot"></span> Topic Completed</div>
      <div class="legend-item"><span class="cal-dot revision-dot"></span> Revision Due</div>
    </div>

    <div class="card" style="padding:0; overflow:hidden">
      <div id="calendar-wrapper"></div>
    </div>

    <!-- Day Detail Modal -->
    <div class="modal-overlay" id="cal-modal" style="display:none">
      <div class="modal cal-detail-modal">
        <h2 class="modal-title" id="cal-modal-title"></h2>
        <div id="cal-modal-body" class="cal-modal-body"></div>
        <div class="modal-actions" style="margin-top:var(--space-md)">
          <button class="btn btn-primary" id="cal-modal-close">Close</button>
        </div>
      </div>
    </div>
  `;

  return {
    html,
    init: () => {
      const wrapper = document.getElementById('calendar-wrapper');
      
      function render() {
        wrapper.innerHTML = renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
        
        document.getElementById('cal-prev').addEventListener('click', () => {
          currentDate.setMonth(currentDate.getMonth() - 1);
          render();
        });
        
        document.getElementById('cal-next').addEventListener('click', () => {
          currentDate.setMonth(currentDate.getMonth() + 1);
          render();
        });

        document.querySelectorAll('.cal-cell:not(.empty)').forEach(cell => {
          cell.addEventListener('click', () => {
            const dateStr = cell.dataset.date;
            openDayModal(dateStr);
          });
        });
      }

      function openDayModal(dateStr) {
        const modal = document.getElementById('cal-modal');
        document.getElementById('cal-modal-title').textContent = formatDate(dateStr);
        
        const dayEvents = eventsByDate[dateStr] || [];
        const body = document.getElementById('cal-modal-body');
        
        if (dayEvents.length === 0) {
          body.innerHTML = '<div class="empty-state"><p class="empty-state-text">No activity recorded for this day.</p></div>';
        } else {
          // Group by type
          const grouped = { session: [], test: [], topic: [], revision: [] };
          dayEvents.forEach(e => grouped[e.type].push(e));

          let bHtml = '';
          
          if (grouped.session.length) {
            bHtml += `<div class="cal-day-group">
              <h3 class="cal-group-title"><span class="cal-dot session-dot" style="display:inline-block;margin-right:8px"></span>Study Sessions</h3>
              <ul class="cal-group-list">${grouped.session.map(e => `<li>${e.detail}</li>`).join('')}</ul>
            </div>`;
          }
          if (grouped.test.length) {
            bHtml += `<div class="cal-day-group">
              <h3 class="cal-group-title"><span class="cal-dot test-dot" style="display:inline-block;margin-right:8px"></span>Mock Tests</h3>
              <ul class="cal-group-list">${grouped.test.map(e => `<li>${e.detail}</li>`).join('')}</ul>
            </div>`;
          }
          if (grouped.topic.length) {
            bHtml += `<div class="cal-day-group">
              <h3 class="cal-group-title"><span class="cal-dot topic-dot" style="display:inline-block;margin-right:8px"></span>Topics Completed</h3>
              <ul class="cal-group-list">${grouped.topic.map(e => `<li>${e.detail}</li>`).join('')}</ul>
            </div>`;
          }
          if (grouped.revision.length) {
            bHtml += `<div class="cal-day-group">
              <h3 class="cal-group-title"><span class="cal-dot revision-dot" style="display:inline-block;margin-right:8px"></span>Revisions Due</h3>
              <ul class="cal-group-list">${grouped.revision.map(e => `<li>${e.detail}</li>`).join('')}</ul>
            </div>`;
          }
          body.innerHTML = bHtml;
        }

        modal.style.display = 'flex';
      }

      const modal = document.getElementById('cal-modal');
      document.getElementById('cal-modal-close').addEventListener('click', () => modal.style.display = 'none');
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

      render();
    }
  };
}
