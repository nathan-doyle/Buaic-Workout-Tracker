import { addTemplate, LIBRARY, seedLibrary, TEMPLATES } from '../library';
import { getRoutineExercises, listExercises, listRoutines } from '../routines';
import type { NodeDb } from '../testing/nodeSqliteAdapter';
import { createFreshV2Database } from '../testing/v2Fixture';
import { ALL_MUSCLE_GROUPS } from '../v1Constants';

let db: NodeDb;
let cleanup: () => void;
beforeEach(() => {
  ({ db, cleanup } = createFreshV2Database());
});
afterEach(() => cleanup());

const count = () => db.get<{ n: number }>('SELECT COUNT(*) AS n FROM exercises')!.n;

describe('exercise library seed', () => {
  it('has about 120 unique, valid exercises', () => {
    expect(LIBRARY.exercises.length).toBeGreaterThanOrEqual(110);
    const ids = LIBRARY.exercises.map((e) => `${e.name.toLowerCase()}|${e.variation.toLowerCase()}`);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of LIBRARY.exercises) {
      expect(ALL_MUSCLE_GROUPS).toContain(e.muscle);
      for (const m of e.secondary) expect(ALL_MUSCLE_GROUPS).toContain(m);
    }
    // Every muscle group has at least one exercise.
    for (const m of ALL_MUSCLE_GROUPS) expect(LIBRARY.exercises.some((e) => e.muscle === m)).toBe(true);
  });

  it("never duplicates a user's exercises, keeps their muscles, and is idempotent", () => {
    // A user's own "bench press / barbell" (different case, different muscle) and an archived one.
    db.run("UPDATE exercises SET name = 'bench press', variation = 'BARBELL', primary_muscle = 'Lower Chest' WHERE name = 'Bench Press'");
    db.run(
      `INSERT INTO exercises (name, variation, primary_muscle, is_custom, archived_at, created_at)
       VALUES ('Shrug', 'Dumbbell', 'Upper Back', 1, '2026-01-02', '2026-01-01')`
    );
    const before = count();
    const inserted = seedLibrary(db);
    expect(count()).toBe(before + inserted);
    expect(inserted).toBe(LIBRARY.exercises.length - 7); // six V1 starters + the user's shrug
    expect(db.get("SELECT name, primary_muscle, equipment FROM exercises WHERE LOWER(name) = 'bench press' AND LOWER(variation) = 'barbell'")).toEqual({
      name: 'bench press',
      primary_muscle: 'Lower Chest',
      equipment: 'Barbell',
    });
    expect(db.get("SELECT primary_muscle, archived_at FROM exercises WHERE name = 'Shrug' AND variation = 'Dumbbell'")).toEqual({
      primary_muscle: 'Upper Back',
      archived_at: '2026-01-02',
    });
    expect(seedLibrary(db)).toBe(0);
    expect(count()).toBe(before + inserted);
  });
});

describe('templates', () => {
  it('creates every template from library exercises', () => {
    seedLibrary(db);
    const before = count();
    for (const t of TEMPLATES) addTemplate(db, t.id);
    expect(count()).toBe(before); // all template exercises come from the library
    const names = listRoutines(db).map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['Upper', 'Lower', 'Full Body A', 'Full Body C']));
    const ppl = listRoutines(db).filter((r) => r.name === 'Push' && r.source === 'template');
    expect(ppl.length).toBe(3); // fresh-install starter Push, PPL's Push, the V1 Push template
    const push = getRoutineExercises(db, ppl[1].id);
    expect(push[0]).toMatchObject({ name: 'Bench Press', targetSets: 4, repMin: 5, repMax: 8, restSeconds: 180 });
    expect(listExercises(db).length).toBe(count());
  });
});
