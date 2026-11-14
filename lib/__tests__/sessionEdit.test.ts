import type { SessionDetail } from '../../db/history';
import { addSetTo, draftFromDetail, editFromDraft } from '../sessionEdit';
import { lbToKg } from '../units';

const detail: SessionDetail = {
  id: 7,
  name: 'Push',
  routineId: null,
  localDate: '2026-11-02',
  tzOffsetMinutes: 60,
  startedAt: '2026-11-02T17:00:00Z',
  endedAt: '2026-11-02T18:00:00Z',
  dateCompleted: '2026-11-02T18:00:00Z',
  notes: null,
  exercises: [
    {
      exerciseId: 1,
      name: 'Bench Press',
      variation: 'Barbell',
      muscle: 'Upper Chest',
      equipment: 'Barbell',
      notes: null,
      sets: [
        { id: 10, setNumber: 1, weight: lbToKg(135), reps: 10, setType: 'warmup', rpe: null },
        { id: 11, setNumber: 2, weight: lbToKg(225), reps: 5, setType: 'working', rpe: 8.5 },
      ],
    },
    { exerciseId: 2, name: 'Dip', variation: '', muscle: 'Lower Chest', equipment: 'Bodyweight', notes: 'slow', sets: [{ id: 12, setNumber: 1, weight: 0, reps: 12, setType: 'working', rpe: null }] },
  ],
};

it('round-trips an untouched session exactly (lb)', () => {
  const draft = draftFromDetail(detail, 'lb');
  expect(draft.exercises[0].sets.map((s) => s.weight.text)).toEqual(['135', '225']);
  expect(draft.exercises[1].sets[0].weight.text).toBe('');
  const result = editFromDraft(draft, 'lb', '2026-11-14');
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.edit.exercises[0].sets).toEqual([
    { id: 10, weight: lbToKg(135), reps: 10, setType: 'warmup', rpe: null },
    { id: 11, weight: lbToKg(225), reps: 5, setType: 'working', rpe: 8.5 },
  ]);
  expect(result.edit.exercises[1]).toEqual({ exerciseId: 2, notes: 'slow', sets: [{ id: 12, weight: 0, reps: 12, setType: 'working', rpe: null }] });
});

it('reads typed values in the shown unit', () => {
  const draft = draftFromDetail(detail, 'kg');
  draft.exercises[0].sets[1].weight = { text: '102,5' };
  draft.exercises[0].sets[1].reps = '6';
  const result = editFromDraft(draft, 'kg', '2026-11-14');
  expect(result.ok && result.edit.exercises[0].sets[1]).toMatchObject({ weight: 102.5, reps: 6 });
});

it('adds a set copying the last one, without its id', () => {
  const draft = draftFromDetail(detail, 'kg');
  const more = addSetTo(draft.exercises[0]);
  expect(more.sets).toHaveLength(3);
  expect(more.sets[2]).toMatchObject({ reps: '5', setType: 'working', rpe: '' });
  expect(more.sets[2].id).toBeUndefined();
  expect(addSetTo({ ...draft.exercises[0], sets: [] }).sets[0]).toMatchObject({ reps: '', setType: 'working' });
});

it('names the first problem', () => {
  const draft = () => draftFromDetail(detail, 'kg');
  const err = (mutate: (d: ReturnType<typeof draft>) => void) => {
    const d = draft();
    mutate(d);
    const r = editFromDraft(d, 'kg', '2026-11-14');
    return r.ok ? null : r.error;
  };
  expect(err((d) => (d.exercises[0].sets[1].reps = '0'))).toBe('Bench Press, set 2: enter the reps (1 or more).');
  expect(err((d) => (d.exercises[0].sets[0].weight = { text: 'abc' }))).toMatch(/set 1: enter a weight/);
  expect(err((d) => (d.exercises[0].sets[0].rpe = '12'))).toMatch(/RPE is 1–10/);
  expect(err((d) => (d.localDate = '2026-11-15'))).toMatch(/future/);
  expect(err((d) => (d.localDate = '14/11/2026'))).toMatch(/YYYY-MM-DD/);
  expect(err((d) => (d.name = ''))).toMatch(/name/);
  expect(err((d) => d.exercises.forEach((e) => (e.sets = [])))).toMatch(/Delete the workout/);
});
