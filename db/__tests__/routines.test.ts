import * as R from '../routines';
import type { NodeDb } from '../testing/nodeSqliteAdapter';
import { createFreshV2Database, exerciseIdByName } from '../testing/v2Fixture';

let db: NodeDb;
let cleanup: () => void;
const now = '2026-11-14T10:00:00.000Z';

beforeEach(() => {
  ({ db, cleanup } = createFreshV2Database());
});
afterEach(() => cleanup());

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe('routines', () => {
  it('lists the starter splits in V1 menu order with their exercises', () => {
    const routines = R.listRoutines(db);
    expect(names(routines).slice(0, 3)).toEqual(['Push', 'Pull', 'Legs']);
    const push = routines[0];
    expect(push.exerciseCount).toBe(3);
    expect(push.exerciseNames).toBe('Overhead Press · Bench Press · Incline Dumbbell Press');
    expect(names(R.getRoutineExercises(db, push.id))).toEqual([
      'Overhead Press',
      'Bench Press',
      'Incline Dumbbell Press',
    ]);
  });

  it('creates, edits, duplicates, archives and reorders', () => {
    const id = R.createRoutine(db, '  Arms ', now);
    R.setRoutineExercises(db, id, [
      { exerciseId: exerciseIdByName(db, 'Bench Press'), targetSets: 4, repMin: 6, repMax: 8, restSeconds: 150 },
      { exerciseId: exerciseIdByName(db, 'Squat'), targetSets: 0, repMin: null, repMax: null, restSeconds: null },
      { exerciseId: exerciseIdByName(db, 'Bench Press'), targetSets: 2, repMin: null, repMax: null, restSeconds: null },
    ]);
    const items = R.getRoutineExercises(db, id);
    expect(items.map((i) => [i.name, i.targetSets, i.repMin, i.repMax, i.restSeconds])).toEqual([
      ['Bench Press', 4, 6, 8, 150],
      ['Squat', 1, null, null, null],
    ]);
    expect(R.listRoutines(db).at(-1)?.name).toBe('Arms');

    const copy = R.duplicateRoutine(db, id, now);
    expect(R.getRoutine(db, copy)?.name).toBe('Arms (copy)');
    expect(names(R.getRoutineExercises(db, copy))).toEqual(['Bench Press', 'Squat']);

    R.setRoutineArchived(db, id, true, now);
    expect(names(R.listRoutines(db))).not.toContain('Arms');
    expect(names(R.listRoutines(db, true)).at(-1)).toBe('Arms');

    const active = R.listRoutines(db);
    R.reorderRoutines(db, [...active.map((r) => r.id)].reverse());
    expect(names(R.listRoutines(db))[0]).toBe('Arms (copy)');
  });

  it('keeps archived exercises in a routine but hides them, and brings them back on restore', () => {
    const push = R.listRoutines(db)[0].id;
    const ohp = exerciseIdByName(db, 'Overhead Press');
    R.setExerciseArchived(db, ohp, true, now);
    expect(names(R.getRoutineExercises(db, push))).toEqual(['Bench Press', 'Incline Dumbbell Press']);
    expect(names(R.listExercises(db))).not.toContain('Overhead Press');
    // Saving the editor doesn't drop the hidden exercise.
    R.setRoutineExercises(db, push, R.getRoutineExercises(db, push).reverse());
    R.setExerciseArchived(db, ohp, false, now);
    expect(names(R.getRoutineExercises(db, push))).toEqual([
      'Overhead Press',
      'Incline Dumbbell Press',
      'Bench Press',
    ]);
  });
});

describe('exercise library', () => {
  it('creates custom exercises without duplicating an existing identity', () => {
    const id = R.createCustomExercise(db, { name: 'Cable Fly', variation: 'Low to High', muscle: 'Upper Chest' }, now);
    expect(R.createCustomExercise(db, { name: 'cable fly', variation: 'low to high', muscle: 'Upper Chest' }, now)).toBe(id);
    expect(R.getExercise(db, id)).toMatchObject({ name: 'Cable Fly', isCustom: 1, setCount: 0 });
  });

  it('hard-deletes only exercises that were never logged', () => {
    const squat = exerciseIdByName(db, 'Squat');
    db.run(
      `INSERT INTO workout_sessions (split_name, date_completed, status, local_date) VALUES ('Legs', ?, 'completed', '2026-11-14')`,
      [now]
    );
    db.run('INSERT INTO set_logs (session_id, exercise_id, set_number, weight, reps) VALUES (1, ?, 1, 100, 5)', [squat]);
    expect(R.deleteExerciseIfUnused(db, squat)).toBe(false);
    const deadlift = exerciseIdByName(db, 'Deadlift');
    expect(R.deleteExerciseIfUnused(db, deadlift)).toBe(true);
    expect(R.getExercise(db, deadlift)).toBeNull();
    expect(R.getExercise(db, squat)?.setCount).toBe(1);
  });
});
