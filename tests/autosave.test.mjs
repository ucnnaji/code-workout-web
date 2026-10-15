import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveQueue } from '../public/autosave.mjs';
const gate = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
test('edits during a save are serialized at the next revision', async () => { const hold = gate(), calls = []; const q = new SaveQueue({ save: async (v, rev, id) => { calls.push({ v, rev, id }); if (calls.length === 1)
        await hold.promise; return { revision: rev + 1 }; } }); q.set({ code: 'one' }); const p = q.flush(); q.set({ code: 'two' }); hold.resolve(); await p; assert.equal(calls.length, 2); assert.equal(calls[1].rev, 1); assert.equal(calls[1].v.code, 'two'); assert.equal(q.dirty, false); });
test('network retry uses the same id and original payload before newer edits', async () => { const calls = []; let first = true; const q = new SaveQueue({ save: async (v, rev, id) => { calls.push({ v, rev, id }); if (first) {
        first = false;
        throw new Error('Lost acknowledgement');
    } return { revision: rev + 1 }; } }); q.set({ code: 'one' }); await assert.rejects(q.flush()); q.set({ code: 'two' }); await q.flush(); assert.equal(calls[0].id, calls[1].id); assert.equal(calls[1].v.code, 'one'); assert.equal(calls[2].v.code, 'two'); assert.equal(q.dirty, false); });
test('revision conflicts preserve local work without automatic overwrite', async () => { let calls = 0; const q = new SaveQueue({ save: async () => { calls++; const e = new Error('conflict'); e.status = 409; throw e; } }); q.set({ code: 'keep this' }); await assert.rejects(q.flush()); assert.equal(q.dirty, true); await assert.rejects(q.flush()); assert.equal(calls, 1); assert.equal(q.value.code, 'keep this'); });
