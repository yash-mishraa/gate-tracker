/* ========================================
   GATE Tracker — Database (IndexedDB via idb)
   ======================================== */

import { openDB } from 'idb';

const DB_VERSION = 2;

let DB_NAME = 'gateTrackerDB_anonymous'; // fallback
let dbPromise = null;

export function setUserId(uid) {
  // Update the database name uniquely for this UID
  DB_NAME = 'gateTrackerDB_' + uid;
  // Reset the promise so getDB() opens the new database
  dbPromise = null; 
}

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Study sessions
        if (!db.objectStoreNames.contains('studySessions')) {
          const ss = db.createObjectStore('studySessions', { keyPath: 'id', autoIncrement: true });
          ss.createIndex('date', 'date');
          ss.createIndex('subjectId', 'subjectId');
        }

        // Subjects
        if (!db.objectStoreNames.contains('subjects')) {
          db.createObjectStore('subjects', { keyPath: 'id', autoIncrement: true });
        }

        // Topics
        if (!db.objectStoreNames.contains('topics')) {
          const ts = db.createObjectStore('topics', { keyPath: 'id', autoIncrement: true });
          ts.createIndex('subjectId', 'subjectId');
        }

        // Notes
        if (!db.objectStoreNames.contains('notes')) {
          const ns = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
          ns.createIndex('subjectId', 'subjectId');
        }

        // Test scores
        if (!db.objectStoreNames.contains('testScores')) {
          const ts = db.createObjectStore('testScores', { keyPath: 'id', autoIncrement: true });
          ts.createIndex('date', 'date');
          ts.createIndex('subjectId', 'subjectId');
        }

        // Daily logs
        if (!db.objectStoreNames.contains('dailyLogs')) {
          db.createObjectStore('dailyLogs', { keyPath: 'date' });
        }

        // Tasks (planner)
        if (!db.objectStoreNames.contains('tasks')) {
          const tk = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
          tk.createIndex('date', 'date');
        }

        // Planned sessions (time-slot planner) — v2
        if (!db.objectStoreNames.contains('plannedSessions')) {
          const ps = db.createObjectStore('plannedSessions', { keyPath: 'id', autoIncrement: true });
          ps.createIndex('date', 'date');
          ps.createIndex('subjectId', 'subjectId');
        }
      }
    });
  }
  return dbPromise;
}

// ── Generic CRUD ──

export async function getAll(storeName) {
  const db = await getDB();
  return db.getAll(storeName);
}

export async function getById(storeName, id) {
  const db = await getDB();
  return db.get(storeName, id);
}

export async function add(storeName, data) {
  const db = await getDB();
  return db.add(storeName, data);
}

export async function put(storeName, data) {
  const db = await getDB();
  return db.put(storeName, data);
}

export async function del(storeName, id) {
  const db = await getDB();
  return db.delete(storeName, id);
}

export async function getAllByIndex(storeName, indexName, value) {
  const db = await getDB();
  return db.getAllFromIndex(storeName, indexName, value);
}

export async function clearStore(storeName) {
  const db = await getDB();
  return db.clear(storeName);
}

// ── Helpers ──

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ── Seed Data (default GATE CSE subjects) ──
export async function seedIfEmpty() {
  const db = await getDB();
  const subjects = await db.getAll('subjects');
  if (subjects.length > 0) return;

  const defaultSubjects = [
    { name: 'Engineering Mathematics', color: '#f97316', icon: '📊' },
    { name: 'Data Structures', color: '#6366f1', icon: '🗂️' },
    { name: 'Algorithms', color: '#8b5cf6', icon: '⚡' },
    { name: 'Operating Systems', color: '#a855f7', icon: '🖥️' },
    { name: 'Computer Networks', color: '#10b981', icon: '🌐' },
    { name: 'Database Management Systems', color: '#06b6d4', icon: '🗄️' },
    { name: 'Theory of Computation', color: '#f59e0b', icon: '📐' },
    { name: 'Compiler Design', color: '#ef4444', icon: '⚙️' },
    { name: 'Computer Organization and Architecture', color: '#14b8a6', icon: '🏗️' },
    { name: 'Discrete Mathematics', color: '#84cc16', icon: '🔢' },
    { name: 'Probability', color: '#ec4899', icon: '🎲' },
    { name: 'Linear Algebra', color: '#0ea5e9', icon: '📏' },
    { name: 'Calculus', color: '#d946ef', icon: '∫' },
  ];

  for (const subj of defaultSubjects) {
    await db.add('subjects', { ...subj, revisionCount: 0, createdAt: new Date().toISOString() });
  }
}
