import Dexie, { type Table } from 'dexie';
import { getDeterministicSubjectColor } from './utils/subjectColors';

export interface Subject {
  id?: number;
  name: string;
  color?: string;
  startDate?: number;
  endDate?: number;
  lastUpdated?: number;
  timeSpent?: number;
}

export interface Topic {
  id?: number;
  subjectId: number;
  name: string;
  status: 'Not Started' | 'In Progress' | 'Completed';
  questionsSolved: number;
  revisionCount: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface PyqTopic {
  id?: number;
  subjectId?: number;
  pyqSubjectId?: number;
  name: string;
  totalQuestions: number;
  attemptedQuestions: number;
  correctQuestions: number;
  revisionCount?: number;
  lastUpdated?: number;
}

export interface PyqSubject {
  id?: number;
  examId?: number;
  name: string;
  standalone?: boolean;
  color?: string;
  createdAt?: number;
  lastUpdated?: number;
}

export interface PyqExam {
  id?: number;
  name: string;
  createdAt?: number;
  lastUpdated?: number;
}

export interface PyqExamSubjectMap {
  id?: number;
  examId: number;
  subjectId: number;
  createdAt?: number;
}

export interface StudySession {
  id?: number;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  subjectId: number;
  topicId?: number;
  type: 'lecture' | 'practice' | 'revision' | 'test' | 'planned';
  plannerSlotId?: number;
  questionsSolved: number;
  pyqsSolved: number;
}

export interface PlannerSlot {
  id?: number;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  subjectId: number;
  topicId?: number;
  type: 'lecture' | 'practice' | 'revision' | 'test';
  completed: boolean;
  notes?: string;
  linkedSessionId?: number; // Maps directly to a StudySession
}

export interface Note {
  id?: number;
  subjectId: number;
  topicId?: number;
  content: string;
  lastUpdated: number;
}

export interface Test {
  id?: number;
  name: string;
  date: number; // timestamp
 totalMarks: number; // legacy compatibility
  obtainedMarks: number; // legacy compatibility
  maxMarks?: number;
  marksObtained?: number;
  timeTaken: number; // minutes
  difficulty?: 'Easy' | 'Medium' | 'Hard';
}

export interface TestSubject {
  id?: number;
  testId: number;
  subjectId: number;
  marksObtained: number;
  totalMarks: number;
}

export class GateTrackerDB extends Dexie {
  subjects!: Table<Subject>;
  pyqSubjects!: Table<PyqSubject>;
  pyqExams!: Table<PyqExam>;
  pyqExamSubjectMaps!: Table<PyqExamSubjectMap>;
  topics!: Table<Topic>;
  pyqTopics!: Table<PyqTopic>;
  studySessions!: Table<StudySession>;
  plannerSlots!: Table<PlannerSlot>;
  notes!: Table<Note>;
  tests!: Table<Test>;
  testSubjects!: Table<TestSubject>;

  constructor() {
    super('GateTrackerDB');
    // Bump version for safety, though only changing un-indexed fields
    this.version(2).stores({
      subjects: '++id, name',
      topics: '++id, subjectId, name',
      pyqTopics: '++id, subjectId, name',
      studySessions: '++id, startTime, subjectId',
      plannerSlots: '++id, date',
      notes: '++id, subjectId, topicId'
    });

    this.version(3).stores({
      tests: '++id, date',
      testSubjects: '++id, testId, subjectId'
    });

    this.version(4).stores({
      pyqSubjects: '++id, name',
      pyqTopics: '++id, pyqSubjectId, subjectId, name'
    }).upgrade(async (tx) => {
      const pyqTopicsTable = tx.table('pyqTopics');
      const pyqSubjectsTable = tx.table('pyqSubjects');
      const subjectsTable = tx.table('subjects');

      const existingPyqSubjects = await pyqSubjectsTable.toArray() as PyqSubject[];
      const pyqTopics = await pyqTopicsTable.toArray() as PyqTopic[];
      if (pyqTopics.length === 0) return;

      const byName = new Map<string, number>();
      existingPyqSubjects.forEach(subject => {
        if (subject.id) byName.set(subject.name.trim().toLowerCase(), subject.id);
      });

      const legacySubjectIds = Array.from(new Set(
        pyqTopics
          .map(topic => topic.subjectId)
          .filter((id): id is number => typeof id === 'number')
      ));

      const legacySubjects = await subjectsTable.bulkGet(legacySubjectIds) as Subject[];
      const legacyById = new Map<number, Subject>();
      legacySubjectIds.forEach((subjectId, index) => {
        const subject = legacySubjects[index];
        if (subject) legacyById.set(subjectId, subject);
      });

      const pyqSubjectIdByLegacyId = new Map<number, number>();

      for (const legacyId of legacySubjectIds) {
        const legacy = legacyById.get(legacyId);
        const name = legacy?.name?.trim() || `Practice Subject ${legacyId}`;
        const key = name.toLowerCase();
        let pyqSubjectId = byName.get(key);

        if (!pyqSubjectId) {
          pyqSubjectId = await pyqSubjectsTable.add({
            name,
            color: legacy?.color || getDeterministicSubjectColor(name),
            createdAt: Date.now(),
            lastUpdated: Date.now()
          }) as number;
          byName.set(key, pyqSubjectId);
        }

        pyqSubjectIdByLegacyId.set(legacyId, pyqSubjectId);
      }

      for (const topic of pyqTopics) {
        if (topic.pyqSubjectId) continue;
        if (typeof topic.subjectId !== 'number') continue;

        const resolvedPyqSubjectId = pyqSubjectIdByLegacyId.get(topic.subjectId);
        if (!resolvedPyqSubjectId || !topic.id) continue;

        await pyqTopicsTable.update(topic.id, { pyqSubjectId: resolvedPyqSubjectId });
      }
    });

    this.version(5).stores({
      subjects: '++id, name',
      topics: '++id, subjectId, name',
      pyqTopics: '++id, pyqSubjectId, subjectId, name',
      studySessions: '++id, startTime, subjectId',
      plannerSlots: '++id, date',
      notes: '++id, subjectId, topicId',
      tests: '++id, date',
      testSubjects: '++id, testId, subjectId',
      pyqSubjects: '++id, name, standalone',
      pyqExams: '++id, name',
      pyqExamSubjectMaps: '++id, examId, subjectId, [examId+subjectId]'
    }).upgrade(async (tx) => {
      const pyqSubjectsTable = tx.table('pyqSubjects');
      const subjects = await pyqSubjectsTable.toArray() as PyqSubject[];

      for (const subject of subjects) {
        if (!subject.id) continue;
        if (typeof subject.standalone === 'boolean') continue;
        await pyqSubjectsTable.update(subject.id, { standalone: true, lastUpdated: Date.now() });
      }
    });

    this.version(6).stores({
      subjects: '++id, name',
      topics: '++id, subjectId, name',
      pyqTopics: '++id, pyqSubjectId, subjectId, name',
      studySessions: '++id, startTime, subjectId',
      plannerSlots: '++id, date',
      notes: '++id, subjectId, topicId',
      tests: '++id, date',
      testSubjects: '++id, testId, subjectId',
      pyqSubjects: '++id, examId, name, standalone, [examId+name]',
      pyqExams: '++id, name',
      pyqExamSubjectMaps: '++id, examId, subjectId, [examId+subjectId]'
    }).upgrade(async (tx) => {
      const pyqSubjectsTable = tx.table('pyqSubjects');
      const pyqTopicsTable = tx.table('pyqTopics');
      const pyqExamSubjectMapsTable = tx.table('pyqExamSubjectMaps');

      const subjects = await pyqSubjectsTable.toArray() as PyqSubject[];
      const maps = await pyqExamSubjectMapsTable.toArray() as PyqExamSubjectMap[];
      const topics = await pyqTopicsTable.toArray() as PyqTopic[];

      const topicsBySubjectId = new Map<number, PyqTopic[]>();
      for (const topic of topics) {
        const ownerSubjectId = topic.pyqSubjectId ?? topic.subjectId;
        if (typeof ownerSubjectId !== 'number') continue;

        if (!topicsBySubjectId.has(ownerSubjectId)) {
          topicsBySubjectId.set(ownerSubjectId, []);
        }
        topicsBySubjectId.get(ownerSubjectId)!.push(topic);
      }

      const examIdsBySubject = new Map<number, number[]>();
      for (const map of maps) {
        const existing = examIdsBySubject.get(map.subjectId) || [];
        if (!existing.includes(map.examId)) existing.push(map.examId);
        examIdsBySubject.set(map.subjectId, existing);
      }

      for (const subject of subjects) {
        if (!subject.id) continue;

        const linkedExamIds = (examIdsBySubject.get(subject.id) || []).sort((a, b) => a - b);
        if (linkedExamIds.length === 0) {
          await pyqSubjectsTable.update(subject.id, {
            examId: undefined,
            standalone: true,
            lastUpdated: Date.now()
          });
          continue;
        }

        const [primaryExamId, ...otherExamIds] = linkedExamIds;
        await pyqSubjectsTable.update(subject.id, {
          examId: primaryExamId,
          standalone: false,
          lastUpdated: Date.now()
        });

        const sourceTopics = topicsBySubjectId.get(subject.id) || [];
        for (const topic of sourceTopics) {
          if (!topic.id) continue;
          await pyqTopicsTable.update(topic.id, {
            pyqSubjectId: subject.id
          });
        }

        for (const examId of otherExamIds) {
          const clonedSubjectId = await pyqSubjectsTable.add({
            examId,
            name: subject.name,
            standalone: false,
            color: subject.color || getDeterministicSubjectColor(subject.name),
            createdAt: Date.now(),
            lastUpdated: Date.now()
          }) as number;

          for (const topic of sourceTopics) {
            await pyqTopicsTable.add({
              pyqSubjectId: clonedSubjectId,
              name: topic.name,
              totalQuestions: topic.totalQuestions,
              attemptedQuestions: topic.attemptedQuestions,
              correctQuestions: topic.correctQuestions,
              revisionCount: topic.revisionCount || 0,
              lastUpdated: Date.now()
            });
          }
        }
      }

      await pyqExamSubjectMapsTable.clear();
    });


    // Native Dexie one-time seeding
    this.on('populate', (tx) => {
      const defaultSubjects = [
        'Linear Algebra', 'Probability and Stats', 'Discrete Maths', 'Calculus',
        'Digital Logic', 'COA', 'C', 'AI', 'DBMS&DW', 'OS', 'CN', 'DS', 'TOC', 'ML', 'ALGO', 'CD'
      ];
      defaultSubjects.forEach(name => {
        tx.table('subjects').add({ name, color: getDeterministicSubjectColor(name) });
      });
    });
  }
}

export const db = new GateTrackerDB();

export async function deleteSubjectCascade(subjectId: number) {
  await db.transaction(
    'rw',
    [db.subjects, db.topics, db.pyqTopics, db.studySessions, db.plannerSlots, db.notes, db.testSubjects],
    async () => {
      await db.subjects.delete(subjectId);
      await db.topics.where('subjectId').equals(subjectId).delete();
      await db.pyqTopics.where('subjectId').equals(subjectId).delete();
      await db.studySessions.where('subjectId').equals(subjectId).delete();
      await db.notes.where('subjectId').equals(subjectId).delete();
      await db.testSubjects.where('subjectId').equals(subjectId).delete();

      const plannerSlots = await db.plannerSlots.toArray();
      const plannerSlotIds = plannerSlots
        .filter(slot => slot.subjectId === subjectId)
        .map(slot => slot.id!)
        .filter(Boolean);

      if (plannerSlotIds.length > 0) {
        await db.plannerSlots.bulkDelete(plannerSlotIds);
      }
    }
  );
}


export async function deletePyqSubjectCascade(pyqSubjectId: number) {
  await db.transaction(
    'rw',
    [db.pyqSubjects, db.pyqTopics, db.pyqExamSubjectMaps],
    async () => {
      await db.pyqSubjects.delete(pyqSubjectId);
      await db.pyqExamSubjectMaps.where('subjectId').equals(pyqSubjectId).delete();
      const topics = await db.pyqTopics.toArray();
      const topicIdsToDelete = topics
        .filter(topic =>
          topic.pyqSubjectId === pyqSubjectId ||
          (topic.pyqSubjectId == null && topic.subjectId === pyqSubjectId)
        )
        .map(topic => topic.id)
        .filter((id): id is number => typeof id === 'number');

      if (topicIdsToDelete.length > 0) {
        await db.pyqTopics.bulkDelete(topicIdsToDelete);
      }
    }
  );
}

export async function deletePyqExamCascade(pyqExamId: number) {
  await db.transaction(
    'rw',
    [db.pyqExams, db.pyqSubjects, db.pyqTopics, db.pyqExamSubjectMaps],
    async () => {
      const examSubjects = await db.pyqSubjects.where('examId').equals(pyqExamId).toArray();

      for (const subject of examSubjects) {
        if (!subject.id) continue;
        await db.pyqSubjects.delete(subject.id);
        await db.pyqExamSubjectMaps.where('subjectId').equals(subject.id).delete();
        const topics = await db.pyqTopics.toArray();
        const topicIdsToDelete = topics
          .filter(topic =>
            topic.pyqSubjectId === subject.id ||
            (topic.pyqSubjectId == null && topic.subjectId === subject.id)
          )
          .map(topic => topic.id)
          .filter((id): id is number => typeof id === 'number');

        if (topicIdsToDelete.length > 0) {
          await db.pyqTopics.bulkDelete(topicIdsToDelete);
        }
      }

      await db.pyqExamSubjectMaps.where('examId').equals(pyqExamId).delete();
      await db.pyqExams.delete(pyqExamId);
    }
  );
}
