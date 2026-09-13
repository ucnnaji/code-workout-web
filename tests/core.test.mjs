import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hashObject, hashSecret, verifySecret, seal, unseal, serializeInputs, deterministicPick, validateAnswers, scoreAssessment, scoreSelfEfficacy, publicDefinition, toCSV, spreadsheetCell, participantCode, studentParticipantCode } from '../lib/core.mjs';
import { defaultConfig, validateConfig, buildSnapshot, canRunLive, canRunRemoteLiveStudy, inputSchemas, assignmentCount, bankCandidates, contentHashForConfig } from '../lib/study.mjs';
import { runtimeIssues, resolvePort } from '../lib/runtime-config.mjs';
const load = name => JSON.parse(readFileSync(new URL('../content/' + name, import.meta.url), 'utf8'));
test('participant IDs are normalized and student-created IDs are constrained', () => { assert.equal(participantCode(' cw-a8 '), 'CW-A8'); assert.equal(studentParticipantCode(' blue_42 '), 'BLUE_42'); assert.throws(() => participantCode('email@example.com')); assert.throws(() => studentParticipantCode('abc')); assert.throws(() => studentParticipantCode('123456789')); });
test('canonical content hashes are independent of object key order', () => assert.equal(hashObject({ b: 2, a: { d: 4, c: 3 } }), hashObject({ a: { c: 3, d: 4 }, b: 2 })));
test('release content hash includes study design but ignores operational session-open switches', () => {
    const base = contentHashForConfig(defaultConfig);
    const changedDesign = structuredClone(defaultConfig); changedDesign.aiEnabled = false;
    assert.notEqual(contentHashForConfig(changedDesign), base);
    const openSwitch = structuredClone(defaultConfig); openSwitch.sessions[1].open = !openSwitch.sessions[1].open;
    assert.equal(contentHashForConfig(openSwitch), base);
});
test('private access key verification uses salted hashes', async () => { const key = randomBytes(18).toString('base64url'), hash = await hashSecret(key); assert.ok(await verifySecret(key, hash)); assert.equal(await verifySecret('wrong', hash), false); assert.notEqual(hash, await hashSecret(key)); });
test('PII encryption is authenticated and bound to its record', () => { const k = randomBytes(32), v = { email: 'synthetic@example.org' }, e = seal(v, k, 'claim:1'); assert.deepEqual(unseal(e, k, 'claim:1'), v); assert.throws(() => unseal(e, k, 'claim:2')); assert.ok(!JSON.stringify(e).includes(v.email)); });
test('structured inputs serialize visible fields into ordered stdin', () => { const schema = inputSchemas.multiInputExample; const x = serializeInputs(schema, { first: '4', second: '7' }); assert.equal(x.stdin, '4\n7\n'); });
test('structured inputs reject injected line breaks, unknown fields and invalid integers', () => { const s = [{ id: 'n', label: 'Number', type: 'integer', required: true }]; assert.throws(() => serializeInputs(s, { n: '4\n7' })); assert.throws(() => serializeInputs(s, { n: 'a' })); assert.throws(() => serializeInputs(s, { n: '4', unknown: '1' })); assert.doesNotThrow(() => serializeInputs(s, { n: '-' }, { required: false })); });
test('stored randomization is deterministic, unique and bank-order independent', () => { const ids = ['a', 'b', 'c', 'd', 'e']; const a = deterministicPick(ids, 'seed', 'wave:1', 3); assert.deepEqual(a, deterministicPick(ids.reverse(), 'seed', 'wave:1', 3)); assert.equal(new Set(a).size, 3); assert.throws(() => deterministicPick(['a'], 'seed', 'x', 3)); });
test('assessment scoring separates missing answers from incorrect answers', () => { const d = { version: 'v1', items: [{ id: 'q1', type: 'single', options: ['A', 'B'], answer: 'B', points: 1 }, { id: 'q2', type: 'single', options: ['A', 'B'], answer: 'A', points: 1 }] }; const ans = validateAnswers(d, { q1: 'A' }); const s = scoreAssessment(d, ans); assert.equal(s.earned, 0); assert.equal(s.nAnswered, 1); assert.equal(s.nSkipped, 1); assert.equal(scoreAssessment(d, validateAnswers(d, {})).earned, null); assert.ok(!JSON.stringify(publicDefinition(d)).includes('"answer"')); });
test('invalid survey responses and unexpected fields are rejected', () => { const d = { items: [{ id: 'i', type: 'multi', options: ['A', 'B'] }] }; assert.throws(() => validateAnswers(d, { i: ['A', 'A'] })); assert.throws(() => validateAnswers(d, { privateEmail: 'x' })); });
test('eight source self-efficacy items are kept separate from new scales', () => { const d = { version: 'v', items: load('surveys.json').selfEfficacy }; assert.equal(d.items.length, 8); const a = Object.fromEntries(d.items.map(i => [i.id, i.options[4]])); const s = scoreSelfEfficacy(d, a); assert.equal(s.mean, 5); assert.equal(s.nExpected, 8); });
test('three distinct session snapshots retain the same participant ID and stage sequence', () => { const pid = randomUUID(); for (const n of [1, 2, 3]) {
    const b = buildSnapshot(defaultConfig, n, pid);
    assert.equal(Object.hasOwn(b.snapshot, 'topic'), false);
    assert.deepEqual(b.stages.map(s => s.key), ['information', 'consent', 'language', 'pre_survey', 'demo', 'coding', 'post_survey', 'incentive', 'completion']);
    assert.equal(b.stages.find(s => s.key === 'consent').document.protocol, '16317');
} });
test('pre- and post-surveys keep the same items while adapting only Python/Java wording', () => { const b = buildSnapshot(defaultConfig, 1, randomUUID()); for (const key of ['pre_survey', 'post_survey']) { const stage = b.stages.find(s => s.key === key), py = stage.variants.python.items, java = stage.variants.java.items; assert.deepEqual(py.map(i => i.id), java.map(i => i.id)); assert.deepEqual(py.map(i => i.options), java.map(i => i.options)); assert.equal(py.length, java.length); assert.ok(java.some(i => i.label.includes('Java'))); assert.equal(java.some(i => i.label.includes('Python')), false); } });
test('optional stages may be disabled but mandatory consent cannot', () => { const c = structuredClone(defaultConfig); c.stages.demo = false; validateConfig(c); assert.equal(buildSnapshot(c, 1, randomUUID()).stages.find(s => s.key === 'demo').enabled, false); c.stages.consent = false; assert.throws(() => validateConfig(c)); assert.equal(buildSnapshot(c, 1, randomUUID()).stages.find(s => s.key === 'consent').enabled, true); });
test('draft/review content cannot enable live collection', () => { assert.equal(canRunLive(defaultConfig), false); const c = structuredClone(defaultConfig); c.release.status = 'approved'; assert.throws(() => validateConfig(c)); assert.equal(canRunLive(c), false); });
test('remote self-enrollment can be opened by the deployment switch without changing release-review metadata', () => { const c = structuredClone(defaultConfig); c.release.status = 'draft'; c.deliveryMode = 'remote'; assert.equal(canRunRemoteLiveStudy(c, true, true), true); assert.equal(canRunRemoteLiveStudy(c, false, true), false); assert.equal(canRunRemoteLiveStudy(c, true, false), false); c.deliveryMode = 'in_person'; assert.equal(canRunRemoteLiveStudy(c, true, true), false); });
test('snapshots are isolated from later configuration edits', () => { const c = structuredClone(defaultConfig), b = buildSnapshot(c, 1, randomUUID()); c.aiEnabled = false; assert.equal(b.snapshot.config.aiEnabled, true); assert.equal(assignmentCount(b.snapshot, b.snapshot.modalityOrder[0]), 2); assert.equal(assignmentCount(b.snapshot, b.snapshot.modalityOrder[1]), 1); });
test('assigned crossover rotates the starting modality without asserting balanced randomization', () => { const c = structuredClone(defaultConfig); c.activityDesign = 'assigned_crossover'; const pid = randomUUID(), primary = []; for (const n of [1, 2, 3]) {
    const b = buildSnapshot(c, n, pid);
    primary.push(b.snapshot.modalityOrder[0]);
    assert.equal(assignmentCount(b.snapshot, primary.at(-1)), 2);
} assert.equal(new Set(primary).size, 3); });
test('question bank mapping filters reviewed IDs and avoids prior-wave repeats', () => { const c = structuredClone(defaultConfig); c.questionIdsBySession = { '1': { python: { debugging: ['a', 'b'] } } }; const q = ['a', 'b', 'c'].map(id => ({ id, language: 'python', modality_id: 'debugging' })); assert.deepEqual(bankCandidates(q, { config: c }, 1, 'debugging', ['a']).map(x => x.id), ['b']); });
test('CSV and Excel exports neutralize spreadsheet formula injection', () => { assert.ok(toCSV([{ response: '=1+1' }]).includes("'=1+1")); assert.ok(toCSV([{ response: '  @SUM(A1)' }]).includes("'  @SUM")); assert.equal(spreadsheetCell('=HYPERLINK(\"https://example.invalid\")').startsWith("'="), true); assert.equal(spreadsheetCell(-3), -3); });
test('illustrative assessment keys reference actual answer options', () => { const a = load('assessments.json'); for (const l of ['python', 'java'])
    for (const n of ['1', '2', '3'])
        for (const phase of ['pre_test', 'post_test'])
            for (const i of a[l][n][phase].items) {
                assert.ok(i.options.includes(i.answer), `${l}/${n}/${phase}/${i.id}`);
            } });
test('the active design has unique IDs and enough questions for three nonrepeating sessions', () => { const bank = JSON.parse(readFileSync(new URL('../questions.seed.json', import.meta.url), 'utf8')); const active = bank.filter(q => ['problem-solving', 'debugging', 'code-explanation'].includes(q.modality_id)); assert.equal(new Set(active.map(q => q.id)).size, active.length); for (const l of ['python', 'java']) for (const m of ['problem-solving', 'debugging', 'code-explanation']) assert.ok(active.filter(q => q.language === l && q.modality_id === m).length >= 6); });


test('runtime configuration strictly validates production URLs, port, and canonical 32-byte encryption key', () => {
    const goodKey = randomBytes(32).toString('base64');
    const base = {
        NODE_ENV: 'production', PORT: '10000', PUBLIC_ORIGIN: 'https://code-workout-web.onrender.com',
        SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test_backend_only',
        ADMIN_TOKEN: 'a'.repeat(32), COMPENSATION_ADMIN_TOKEN: 'b'.repeat(32), PII_ENCRYPTION_KEY: goodKey,
        OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'test-model', EXECUTION_PROVIDER: 'judge0',
        JUDGE0_URL: 'https://ce.judge0.com', LIVE_COLLECTION_ENABLED: 'false', OPENAI_MAX_CONCURRENCY: '120', JUDGE0_MAX_CONCURRENCY: '120'
    };
    assert.deepEqual(runtimeIssues(base), []);
    assert.equal(resolvePort('10000'), 10000);
    assert.equal(resolvePort('not-a-port'), 3000);
    assert.ok(runtimeIssues({ ...base, PORT: '0' }).some(x => x.startsWith('PORT')));
    assert.ok(runtimeIssues({ ...base, PUBLIC_ORIGIN: 'https://code-workout-web.onrender.com/path' }).some(x => x.startsWith('PUBLIC_ORIGIN')));
    assert.ok(runtimeIssues({ ...base, SUPABASE_URL: 'http://example.supabase.co' }).some(x => x.startsWith('SUPABASE_URL')));
    assert.ok(runtimeIssues({ ...base, PII_ENCRYPTION_KEY: goodKey.replace(/=$/, '') }).some(x => x.startsWith('PII_ENCRYPTION_KEY')));
});
