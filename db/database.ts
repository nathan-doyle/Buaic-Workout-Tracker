/**
 * Developer: Nathan Doyle
 * Application: Buaic Workout Tracker
 * File: db/database.ts
 * Purpose: Local SQLite persistence layer. Manages database tables, relational schemas,
 *          universal exercise mappings across splits, past performance tracking,
 *          weekly volume calculations, and calendar history queries.
 *
 * V2 Phase 1b: typed port of the V1 `database.js`. Behaviour (SQL, rounding, UTC dates,
 * error handling) is unchanged on purpose; Phase 2 replaces this layer with the
 * versioned schema, migrations and queries.
 */

import * as SQLite from 'expo-sqlite';

// ==========================================
// 0. ROW & RESULT TYPES
// ==========================================

/** A row of the V1 `exercises` table (one row per exercise per split). */
export interface ExerciseRow {
  id: number;
  name: string;
  /** `TEXT DEFAULT ''`, but rows from before the column existed can hold NULL. */
  variation: string | null;
  target_muscle: string;
  split_category: string;
}

/** A completed set handed to `saveWorkoutSession` (weight already in kg). */
export interface SetLogInput {
  exerciseId: number;
  setNumber: number;
  weight: number;
  reps: number;
}

/** The best set of the most recent session of an exercise. */
export interface PastSet {
  set_number: number;
  weight: number;
  reps: number;
}

/** A row of the Top Sets tab. */
export interface TopSetRow {
  exercise_id: number;
  name: string;
  variation: string | null;
  split_category: string;
  target_muscle: string;
  weight: number;
  reps: number;
  date: string;
}

export type CoverageStatus = 'red' | 'grey' | 'gold';

export interface MuscleCoverage {
  status: CoverageStatus;
  hasExercise: boolean;
  setsThisWeek: number;
}

export interface HistorySet {
  exercise_name: string;
  variation: string | null;
  target_muscle: string;
  set_number: number;
  weight: number;
  reps: number;
}

export interface HistorySession {
  session_id: number;
  split_name: string;
  date_completed: string;
  notes: string | null;
  total_sets: number;
  /** NULL for a session without sets (LEFT JOIN). */
  total_volume: number | null;
  sets: HistorySet[];
}

export interface CalendarDay {
  hasWorkout: boolean;
  hasPR: boolean;
}

// ==========================================
// 1. DATABASE CONNECTION & SINGLETON
// ==========================================
// Opens or creates the local SQLite database file on the mobile device
const db = SQLite.openDatabaseSync('iron_and_stone.db');

// ==========================================
// 2. ANATOMICAL MUSCLE-TO-SPLIT MAPPINGS
// ==========================================
// Maps specific muscle groups to all matching workout split categories.
// Ensures that when a user creates an exercise targeting a muscle,
// it automatically appears in all relevant routines.
export const MUSCLE_SPLIT_MAP: Record<string, string[]> = {
  'Upper Chest': ['Push', 'Anterior', 'Upper', 'Full Body'],
  'Lower Chest': ['Push', 'Anterior', 'Upper', 'Full Body'],
  'Front Delts': ['Push', 'Anterior', 'Upper', 'Full Body'],
  'Side Delts': ['Push', 'Anterior', 'Upper', 'Full Body'],
  'Rear Delts': ['Pull', 'Posterior', 'Upper', 'Full Body'],
  'Upper Back': ['Pull', 'Posterior', 'Upper', 'Full Body'],
  'Lats': ['Pull', 'Posterior', 'Upper', 'Full Body'],
  'Lower Back': ['Pull', 'Posterior', 'Lower', 'Full Body'],
  'Biceps': ['Pull', 'Anterior', 'Upper', 'Full Body'],
  'Triceps': ['Push', 'Posterior', 'Upper', 'Full Body'],
  'Forearms': ['Pull', 'Anterior', 'Upper', 'Full Body'],
  'Abs': ['Push', 'Anterior', 'Upper', 'Full Body'],
  'Quads': ['Legs', 'Anterior', 'Lower', 'Full Body'],
  'Hamstrings': ['Legs', 'Posterior', 'Lower', 'Full Body'],
  'Glutes': ['Legs', 'Posterior', 'Lower', 'Full Body'],
  'Calves': ['Legs', 'Posterior', 'Lower', 'Full Body'],
};

// Master list of all 16 tracked muscle groups for the Coverage engine
export const ALL_MUSCLE_GROUPS: string[] = [
  'Upper Chest',
  'Lower Chest',
  'Front Delts',
  'Side Delts',
  'Rear Delts',
  'Upper Back',
  'Lats',
  'Lower Back',
  'Biceps',
  'Triceps',
  'Forearms',
  'Abs',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
];

// ==========================================
// 3. DATABASE INITIALIZATION & MIGRATIONS
// ==========================================
export const initDatabase = (): void => {
  try {
    // Enforce foreign key constraints for cascading deletes
    db.execSync('PRAGMA foreign_keys = ON;');

    // Table 1: Exercises Library
    db.execSync(`
      CREATE TABLE IF NOT EXISTS exercises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        variation TEXT DEFAULT '',
        target_muscle TEXT NOT NULL,
        split_category TEXT NOT NULL
      );
    `);

    // Migration fallback: Ensure variation column exists on legacy installations
    try {
      db.execSync("ALTER TABLE exercises ADD COLUMN variation TEXT DEFAULT '';");
    } catch {
      // Column already exists
    }

    // Table 2: Workout Sessions (Master log entries)
    db.execSync(`
      CREATE TABLE IF NOT EXISTS workout_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        split_name TEXT NOT NULL,
        date_completed TEXT NOT NULL,
        notes TEXT
      );
    `);

    // Table 3: Set Logs (Individual sets completed within a session)
    db.execSync(`
      CREATE TABLE IF NOT EXISTS set_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        exercise_id INTEGER,
        set_number INTEGER NOT NULL,
        weight REAL NOT NULL,
        reps INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
      );
    `);

    // Table 4: Legacy / Manual PR Records
    db.execSync(`
      CREATE TABLE IF NOT EXISTS pr_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lift_name TEXT UNIQUE NOT NULL,
        weight REAL NOT NULL,
        reps INTEGER NOT NULL,
        estimated_1rm REAL NOT NULL,
        date_achieved TEXT NOT NULL
      );
    `);

    // Default Seeding: Populate starting exercises if database is clean
    // (COUNT(*) always returns exactly one row.)
    const count = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM exercises');
    if (count !== null && count.count === 0) {
      addUniversalExercise('Bench Press', 'Barbell', 'Upper Chest');
      addUniversalExercise('Overhead Press', 'Barbell', 'Front Delts');
      addUniversalExercise('Incline Dumbbell Press', 'Dumbbell', 'Upper Chest');
      addUniversalExercise('Barbell Row', 'Barbell', 'Lats');
      addUniversalExercise('Deadlift', 'Conventional', 'Lower Back');
      addUniversalExercise('Squat', 'Barbell', 'Quads');
    }

    console.log('Database initialized successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

// ==========================================
// 4. EXERCISE CREATION & RETRIEVAL
// ==========================================

/**
 * Automatically inserts an exercise into all relevant splits based on target muscle.
 */
export const addUniversalExercise = (
  name: string,
  variation: string | null | undefined,
  targetMuscle: string
): boolean => {
  try {
    const relevantSplits = MUSCLE_SPLIT_MAP[targetMuscle] || ['Push', 'Upper', 'Full Body'];

    for (const split of relevantSplits) {
      const existing = db.getFirstSync<{ id: number }>(
        'SELECT id FROM exercises WHERE LOWER(name) = LOWER(?) AND LOWER(variation) = LOWER(?) AND split_category = ?;',
        [name, variation || '', split]
      );

      if (!existing) {
        db.runSync(
          'INSERT INTO exercises (name, variation, target_muscle, split_category) VALUES (?, ?, ?, ?);',
          [name, variation || '', targetMuscle, split]
        );
      }
    }
    return true;
  } catch (error) {
    console.error('Error adding universal exercise:', error);
    return false;
  }
};

/**
 * Fetches exercises filtered by the active split, auto-sorted by target muscle group then name.
 */
export const getExercisesBySplit = (splitCategory: string): ExerciseRow[] => {
  try {
    return db.getAllSync<ExerciseRow>(
      'SELECT * FROM exercises WHERE split_category = ? ORDER BY target_muscle ASC, name ASC;',
      [splitCategory]
    );
  } catch (error) {
    console.error('Error fetching exercises by split:', error);
    return [];
  }
};

/**
 * Completely removes an exercise across all mapped splits by matching name and variation.
 */
export const deleteExercise = (exerciseId: number): boolean => {
  try {
    const target = db.getFirstSync<Pick<ExerciseRow, 'name' | 'variation'>>(
      'SELECT name, variation FROM exercises WHERE id = ?;',
      [exerciseId]
    );
    if (target) {
      db.runSync(
        'DELETE FROM exercises WHERE LOWER(name) = LOWER(?) AND LOWER(variation) = LOWER(?);',
        [target.name, target.variation || '']
      );
    } else {
      db.runSync('DELETE FROM exercises WHERE id = ?;', [exerciseId]);
    }
    return true;
  } catch (error) {
    console.error('Error deleting exercise:', error);
    return false;
  }
};

// ==========================================
// 5. SESSION LOGGING & PERFORMANCE
// ==========================================

/**
 * Persists a completed session record and all its associated set logs.
 * (V1 behaviour: not wrapped in a transaction. Phase 2 fixes this.)
 */
export const saveWorkoutSession = (
  splitName: string,
  notes: string | null | undefined,
  setLogs: SetLogInput[]
): boolean => {
  try {
    const isoDate = new Date().toISOString();

    const result = db.runSync(
      'INSERT INTO workout_sessions (split_name, date_completed, notes) VALUES (?, ?, ?);',
      [splitName, isoDate, notes || '']
    );

    const sessionId = result.lastInsertRowId;

    for (const log of setLogs) {
      db.runSync(
        'INSERT INTO set_logs (session_id, exercise_id, set_number, weight, reps) VALUES (?, ?, ?, ?, ?);',
        [sessionId, log.exerciseId, log.setNumber, log.weight, log.reps]
      );
    }

    return true;
  } catch (error) {
    console.error('Error saving workout session:', error);
    return false;
  }
};

/**
 * Retrieves the best past set (highest calculated 1RM) from the most recent session of an exercise.
 */
export const getLastExercisePerformance = (exerciseId: number): PastSet | null => {
  try {
    const latestSession = db.getFirstSync<{ session_id: number }>(
      `SELECT session_id
       FROM set_logs
       WHERE exercise_id = ?
       ORDER BY id DESC
       LIMIT 1;`,
      [exerciseId]
    );

    if (!latestSession) return null;

    const sets = db.getAllSync<PastSet>(
      `SELECT set_number, weight, reps
       FROM set_logs
       WHERE exercise_id = ? AND session_id = ?;`,
      [exerciseId, latestSession.session_id]
    );

    if (sets.length === 0) return null;

    let bestSet = sets[0];
    let max1RM = bestSet.reps === 1 ? bestSet.weight : bestSet.weight * (1 + bestSet.reps / 30);

    for (const set of sets) {
      const est1RM = set.reps === 1 ? set.weight : set.weight * (1 + set.reps / 30);
      if (est1RM > max1RM) {
        max1RM = est1RM;
        bestSet = set;
      }
    }

    return bestSet;
  } catch (error) {
    console.error('Error fetching past performance:', error);
    return null;
  }
};

/**
 * Queries the heaviest all-time weight logged per exercise to display on the Top Sets tab.
 */
export const getBig3PRs = (): TopSetRow[] => {
  try {
    const query = `
      SELECT
        e.id as exercise_id,
        e.name,
        e.variation,
        e.split_category,
        e.target_muscle,
        MAX(l.weight) as weight,
        l.reps,
        s.date_completed as date
      FROM set_logs l
      JOIN exercises e ON l.exercise_id = e.id
      JOIN workout_sessions s ON l.session_id = s.id
      WHERE l.weight > 0
      GROUP BY e.name, e.variation
      ORDER BY weight DESC;
    `;
    return db.getAllSync<TopSetRow>(query);
  } catch (error) {
    console.error('Error fetching PRs:', error);
    return [];
  }
};

// ==========================================
// 6. MUSCLE COVERAGE ENGINE (PAST 7 DAYS)
// ==========================================

/**
 * Compiles a 3-tier status for every muscle group:
 * - 'red': No exercise exists in the library for this muscle.
 * - 'grey': Exercises exist in library, but 0 sets logged in past 7 days.
 * - 'gold': 1+ sets logged in the past 7 days.
 */
export const getMuscleCoverageStatus = (): Record<string, MuscleCoverage> => {
  try {
    // Step 1: Detect existing exercises in library
    const existingExerciseRows = db.getAllSync<{ target_muscle: string }>(`
      SELECT DISTINCT target_muscle
      FROM exercises;
    `);
    const existingMuscles = new Set(existingExerciseRows.map((r) => r.target_muscle));

    // Step 2: Query volume logged over the rolling 7-day window
    const recentSetRows = db.getAllSync<{ target_muscle: string; total_sets: number }>(`
      SELECT e.target_muscle, COUNT(l.id) as total_sets
      FROM set_logs l
      JOIN exercises e ON l.exercise_id = e.id
      JOIN workout_sessions s ON l.session_id = s.id
      WHERE date(s.date_completed) >= date('now', '-7 days')
      GROUP BY e.target_muscle;
    `);

    const weeklySetMap: Record<string, number> = {};
    recentSetRows.forEach((r) => {
      weeklySetMap[r.target_muscle] = r.total_sets;
    });

    // Step 3: Compute state across all anatomical muscle groups
    const statusMap: Record<string, MuscleCoverage> = {};
    ALL_MUSCLE_GROUPS.forEach((muscle) => {
      const hasExercise = existingMuscles.has(muscle);
      const setsThisWeek = weeklySetMap[muscle] || 0;

      let status: CoverageStatus = 'red';
      if (hasExercise && setsThisWeek > 0) {
        status = 'gold';
      } else if (hasExercise && setsThisWeek === 0) {
        status = 'grey';
      }

      statusMap[muscle] = {
        status,
        hasExercise,
        setsThisWeek,
      };
    });

    return statusMap;
  } catch (error) {
    console.error('Error computing muscle coverage status:', error);
    return {};
  }
};

// ==========================================
// 7. HISTORY & CALENDAR LOGGING
// ==========================================

/**
 * Queries full session logs with nested exercise set details for the History tab.
 */
export const getWorkoutHistory = (): HistorySession[] => {
  try {
    const sessions = db.getAllSync<Omit<HistorySession, 'sets'>>(`
      SELECT
        s.id as session_id,
        s.split_name,
        s.date_completed,
        s.notes,
        COUNT(l.id) as total_sets,
        SUM(l.weight * l.reps) as total_volume
      FROM workout_sessions s
      LEFT JOIN set_logs l ON s.id = l.session_id
      GROUP BY s.id
      ORDER BY s.date_completed DESC;
    `);

    return sessions.map((session) => {
      const sets = db.getAllSync<HistorySet>(`
        SELECT
          e.name as exercise_name,
          e.variation,
          e.target_muscle,
          l.set_number,
          l.weight,
          l.reps
        FROM set_logs l
        JOIN exercises e ON l.exercise_id = e.id
        WHERE l.session_id = ?
        ORDER BY e.target_muscle ASC, e.name ASC, l.set_number ASC;
      `, [session.session_id]);

      return { ...session, sets };
    });
  } catch (error) {
    console.error('Error fetching workout history:', error);
    return [];
  }
};

/**
 * Returns a calendar activity map flagging workout days and marking Big 3 PR days strictly.
 */
export const getCalendarActivity = (): Record<string, CalendarDay> => {
  try {
    const activity = db.getAllSync<{ workout_date: string }>(`
      SELECT DATE(date_completed) as workout_date
      FROM workout_sessions
      GROUP BY DATE(date_completed);
    `);

    const prDates = db.getAllSync<{ pr_date: string }>(`
      SELECT DISTINCT DATE(s.date_completed) as pr_date
      FROM set_logs l
      JOIN workout_sessions s ON l.session_id = s.id
      JOIN exercises e ON l.exercise_id = e.id
      WHERE (
        LOWER(e.name) LIKE '%bench press%' OR
        LOWER(e.name) LIKE '%squat%' OR
        LOWER(e.name) LIKE '%deadlift%'
      )
      AND l.weight = (
        SELECT MAX(weight) FROM set_logs WHERE exercise_id = l.exercise_id
      )
      AND l.weight > 0;
    `);

    const prSet = new Set(prDates.map((p) => p.pr_date));
    const activityMap: Record<string, CalendarDay> = {};

    activity.forEach((item) => {
      activityMap[item.workout_date] = {
        hasWorkout: true,
        hasPR: prSet.has(item.workout_date),
      };
    });

    return activityMap;
  } catch (error) {
    console.error('Error fetching calendar activity:', error);
    return {};
  }
};

/**
 * Deletes a session and triggers cascading deletes for set logs.
 */
export const deleteWorkoutSession = (sessionId: number): boolean => {
  try {
    db.runSync('DELETE FROM workout_sessions WHERE id = ?;', [sessionId]);
    return true;
  } catch (error) {
    console.error('Error deleting session:', error);
    return false;
  }
};

export default db;
