import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defaultConfig, buildSnapshot } from '../lib/study.mjs';
let PGlite;
try {
    ({ PGlite } = await import('@electric-sql/pglite'));
}
catch { }
test('Postgres integration: migration rerun, ACLs, session uniqueness, stage locks, CAS, privacy and completion', { skip: !PGlite ? 'Install devDependencies to run the Postgres-compatible integration test.' : false }, async () => {
    const db = new PGlite();
    try {
        await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
        const sql = readFileSync(new URL('../supabase_workflow.sql', import.meta.url), 'utf8').replace(/create extension if not exists pgcrypto;/i, '-- gen_random_uuid is built in to this test Postgres.');
        await db.exec(sql);
        await db.exec(sql);
        const call = async (action, p = {}) => (await db.query('SELECT public.cw_rpc($1,$2::jsonb) AS value', [action, JSON.stringify(p)])).rows[0].value;
        const cfg = structuredClone(defaultConfig);
        await call('config_init', { studyKey: cfg.studyKey, config: cfg });
        const enrollment = await call('enroll', { code: 'TEST-LONGITUDINAL', hash: 'test-hash-not-for-login', isTest: true, language: 'python' }), pid = enrollment.participantId;
        const create = async (number) => call('session_start', { pid, number, studyKey: cfg.studyKey, label: 'Session ' + number, version: '4.0.0', seed: 'test-seed', ...buildSnapshot(cfg, number, pid) });
        const s = await create(1), s2 = await create(2);
        assert.notEqual(s.id, s2.id);
        assert.equal((await create(1)).id, s.id);
        const sid = s.id;
        await assert.rejects(call('stage_open', { pid, sid, stage: 'pre_survey' }), /current stage/);
        await assert.rejects(call('state', { pid: randomUUID(), sid }), /Session not found/);
        const save = async (stage, extra = {}) => call('stage_save', { pid, sid, stage, revision: 0, requestId: randomUUID(), final: true, responses: { acknowledged: true }, ...extra });
        await save('information');
        await save('consent', { responses: { consented: true }, documentVersion: 'test', documentHash: 'hash', document: { title: 'test', sections: [] }, signature: { ciphertext: 'encrypted-test-value' } });
        const req = randomUUID(), p = { pid, sid, stage: 'pre_survey', revision: 0, requestId: req, final: false, responses: { se_1: 'example' } };
        assert.equal((await call('stage_save', p)).revision, 1);
        assert.equal((await call('stage_save', p)).revision, 1);
        await assert.rejects(call('stage_save', { ...p, requestId: randomUUID() }), /newer response/);
        await save('pre_survey', { revision: 1, skipped: true });
        await save('demo');
        await save('language', { responses: { language: 'python' } });
        const snapshot = buildSnapshot(cfg, 1, pid).snapshot, primary = snapshot.modalityOrder[0];
        const bank = await call('bank', { language: 'python' }), candidates = bank.filter(q => q.modality_id === primary).slice(0, 2);
        const activity = await call('coding_start', { pid, sid, modality: primary, questions: candidates.map(q => ({ ...q, inputSchema: [] })), questionIds: candidates.map(q => q.id) });
        const aid = activity.assignment.id, opId = randomUUID(), opReq = randomUUID();
        const op = await call('operation_begin', { pid, sid, assignmentId: aid, kind: 'execute', id: opId, requestId: opReq, limit: 30, payload: { code: 'print(1)' } });
        assert.equal(op.status, 'pending');
        assert.equal((await call('operation_begin', { pid, sid, assignmentId: aid, kind: 'execute', id: randomUUID(), requestId: opReq, limit: 30, payload: {} })).id, opId);
        await call('operation_finish', { pid, sid, assignmentId: aid, id: opId, status: 'succeeded', result: { stdout: '1' } });
        await call('operation_displayed', { pid, sid, id: opId });
        await save('coding', { skipped: true });
        assert.equal((await call('state', { pid, sid })).session.status, 'active');
        await save('post_survey', { skipped: true });
        const claimId = randomUUID();
        await save('incentive', { claimId, claimStatus: 'contact_pending', contact: null, responses: { choice: 'later' } });
        assert.equal((await call('state', { pid, sid })).session.status, 'completed');
        assert.equal((await call('claim_get', { pid, sid })).contactProvided, false);
        assert.ok(!JSON.stringify(await call('admin_export', { table: 'stages' })).includes('encrypted-test-value'));
        await assert.rejects(call('admin_export', { table: 'cw_private_consents' }), /not allowed/);
        const acl = await db.query("SELECT has_function_privilege('anon','public.cw_rpc(text,jsonb)','EXECUTE') AS allowed");
        assert.equal(acl.rows[0].allowed, false);
    }
    finally {
        await db.close();
    }
});
