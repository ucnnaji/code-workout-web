import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviders } from '../lib/providers.mjs';
import { Database } from '../lib/database.mjs';
test('OpenAI payload uses store:false and sends no participant/session identifiers', async () => { const original = globalThis.fetch; let payload; globalThis.fetch = async (url, options) => { payload = JSON.parse(options.body); return { ok: true, json: async () => ({ id: 'response-test', model: 'test-model', output: [{ content: [{ type: 'output_text', text: 'Consider the loop bound.' }] }] }) }; }; try {
    const r = await createProviders({ OPENAI_API_KEY: 'test', OPENAI_MODEL: 'test-model' }).feedback({ language: 'python', modality: 'problem-solving', feedbackType: 'hint', question: { id: 'q', prompt: 'Print numbers' }, code: 'print(1)', explanation: '', output: null });
    assert.equal(payload.store, false);
    assert.equal(r.feedback, 'Consider the loop bound.');
    assert.ok(!/participantId|sessionId|email/.test(payload.input));
}
finally { globalThis.fetch = original; } });
test('unsupported execution provider is rejected rather than executing locally', async () => { await assert.rejects(createProviders({ EXECUTION_PROVIDER: 'local-shell' }).execute('python', 'print(1)', ''), /unsupported/i); });
test('Judge0 receives resource limits, disabled network, and encoded structured input', async () => { const original = globalThis.fetch; let sent, calls = 0; globalThis.fetch = async (url, opts) => { calls++; if (calls === 1) {
    sent = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ token: 'mock-token' }) };
} return { ok: true, json: async () => ({ status: { id: 3, description: 'Accepted' }, stdout: Buffer.from('11\n').toString('base64'), time: '0.01', memory: 1024 }) }; }; try {
    const r = await createProviders({ EXECUTION_PROVIDER: 'judge0', JUDGE0_URL: 'https://sandbox.example.org', JUDGE0_PYTHON_ID: '71', JUDGE0_JAVA_ID: '62' }).execute('python', 'print(11)', '4\n7\n');
    assert.equal(sent.enable_network, false);
    assert.equal(sent.cpu_time_limit, 3);
    assert.equal(Buffer.from(sent.stdin, 'base64').toString(), '4\n7\n');
    assert.equal(r.stdout, '11\n');
    assert.equal(r.runtimeMs, 10);
}
finally { globalThis.fetch = original; } });
test('Judge0 runtime IDs are discovered when explicit IDs are omitted', async () => { const original = globalThis.fetch; const urls = []; globalThis.fetch = async (url, opts = {}) => { urls.push(String(url)); if (String(url).endsWith('/languages')) return { ok: true, json: async () => [{ id: 71, name: 'Python (3.8.1)' }, { id: 62, name: 'Java (OpenJDK 13.0.1)' }] }; if (opts.method === 'POST') return { ok: true, json: async () => ({ token: 't' }) }; return { ok: true, json: async () => ({ status: { id: 3, description: 'Accepted' }, stdout: Buffer.from('ok').toString('base64'), time: '0.01', memory: 1 }) }; }; try {
    const r = await createProviders({ EXECUTION_PROVIDER: 'judge0', JUDGE0_URL: 'https://sandbox.example.org' }).execute('java', 'class Main {}', '');
    assert.equal(r.stdout, 'ok');
    assert.ok(urls.some(u => u.endsWith('/languages')));
} finally { globalThis.fetch = original; } });
test('structured grading returns a bounded score and keeps storage disabled', async () => { const original = globalThis.fetch; let payload; globalThis.fetch = async (url, options) => { payload = JSON.parse(options.body); return { ok: true, json: async () => ({ id: 'grade', model: 'test-model', output: [{ content: [{ type: 'output_text', text: '{"score":100,"summary":"Correct.","checks":[{"label":"Meets the task","passed":true}]}' }] }] }) }; }; try {
    const r = await createProviders({ OPENAI_API_KEY: 'test', OPENAI_MODEL: 'test-model' }).grade({ language: 'python', modality: 'problem-solving', question: { prompt: 'Print 1.' }, code: 'print(1)', explanation: '', execution: { status: 'Accepted', stdout: '1\n', stderr: '', compileOutput: '' }, expectedConcepts: ['print'] });
    assert.equal(r.score, 100); assert.equal(payload.store, false); assert.equal(payload.text.format.type, 'json_schema'); assert.equal(payload.text.format.strict, true); assert.equal(r.checks[0].passed, true);
} finally { globalThis.fetch = original; } });
test('failed compilation is still scored by the AI rubric for runnable modalities', async () => { const original = globalThis.fetch; let calls = 0, payload; globalThis.fetch = async (url, options) => { calls++; payload = JSON.parse(options.body); return { ok: true, json: async () => ({ id: 'grade-failed-run', model: 'test-model', output: [{ content: [{ type: 'output_text', text: '{\"score\":15,\"summary\":\"The program does not compile yet.\",\"checks\":[{\"label\":\"Program compiles\",\"passed\":false}]}' }] }] }) }; }; try {
    const r = await createProviders({ OPENAI_API_KEY: 'test', OPENAI_MODEL: 'test-model' }).grade({ language: 'java', modality: 'debugging', question: { id: 'j1', prompt: 'Fix the error.' }, code: 'class Main {', explanation: '', execution: { status: 'Compilation Error', stdout: '', stderr: '', compileOutput: 'reached end of file' }, expectedConcepts: ['syntax'] });
    assert.equal(calls, 1); assert.equal(r.score, 15); assert.equal(r.method, 'ai-rubric-all-modalities-v2'); assert.match(payload.input, /Compilation Error/);
} finally { globalThis.fetch = original; } });
test('Supabase secret keys remain in backend headers; new keys are not JWT bearer tokens', async () => { const original = globalThis.fetch; let opts; globalThis.fetch = async (url, o) => { opts = o; return { ok: true, text: async () => '{}' }; }; try {
    await new Database('https://example.supabase.co', 'sb_secret_fake').call('state', { sid: 'test' });
    assert.equal(opts.headers.apikey, 'sb_secret_fake');
    assert.equal(opts.headers.Authorization, undefined);
    assert.equal(JSON.parse(opts.body).action, 'state');
}
finally { globalThis.fetch = original; } });
test('database revision conflicts produce 409 without disclosing raw database details', async () => { const original = globalThis.fetch; globalThis.fetch = async () => ({ ok: false, text: async () => JSON.stringify({ message: 'CONFLICT: Reload first.' }) }); try {
    await assert.rejects(new Database('https://example.supabase.co', 'x').call('stage_save'), e => e.status === 409 && e.message === 'Reload first.');
}
finally { globalThis.fetch = original; } });


test('Judge0 runtime discovery is coalesced during a concurrent lab burst', async () => {
    const original = globalThis.fetch; let languageCalls = 0, n = 0;
    globalThis.fetch = async (url, opts = {}) => {
        const u = String(url);
        if (u.endsWith('/languages')) { languageCalls++; await new Promise(r => setTimeout(r, 10)); return { ok: true, status: 200, json: async () => [{ id: 71, name: 'Python (3.11)' }, { id: 62, name: 'Java (OpenJDK 17)' }] }; }
        if (opts.method === 'POST') return { ok: true, status: 201, json: async () => ({ token: `t-${++n}` }) };
        return { ok: true, status: 200, json: async () => ({ status: { id: 3, description: 'Accepted' }, stdout: Buffer.from('ok').toString('base64'), time: '0.01', memory: 1 }) };
    };
    try {
        const p = createProviders({ EXECUTION_PROVIDER: 'judge0', JUDGE0_URL: 'https://dedupe-sandbox.example' });
        const runs = await Promise.all(Array.from({ length: 40 }, () => p.execute('python', 'print(1)', '')));
        assert.equal(runs.length, 40); assert.equal(languageCalls, 1);
    } finally { globalThis.fetch = original; }
});

test('OpenAI transient 429 is retried once without changing storage policy', async () => {
    const original = globalThis.fetch; let calls = 0, lastPayload;
    globalThis.fetch = async (url, options) => {
        calls++; lastPayload = JSON.parse(options.body);
        if (calls === 1) return { ok: false, status: 429, headers: { get: () => '0' } };
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ id: 'retry-ok', model: 'test-model', output: [{ content: [{ type: 'output_text', text: '{"score":75,"summary":"Mostly correct.","checks":[{"label":"Task","passed":true}]}' }] }] }) };
    };
    try {
        const r = await createProviders({ OPENAI_API_KEY: 'test', OPENAI_MODEL: 'test-model' }).grade({ language: 'python', modality: 'problem-solving', question: { id: 'q', prompt: 'Print 1', starter_code: '' }, code: 'print(1)', explanation: '', execution: { status: 'Accepted', stdout: '1\n', stderr: '', compileOutput: '' }, expectedConcepts: [] });
        assert.equal(calls, 2); assert.equal(r.score, 75); assert.equal(lastPayload.store, false);
    } finally { globalThis.fetch = original; }
});

test('provider concurrency limits honor deployment environment variables', async () => {
    const original = globalThis.fetch;
    let aiActive = 0, aiMax = 0;
    globalThis.fetch = async () => {
        aiActive++; aiMax = Math.max(aiMax, aiActive);
        await new Promise(r => setTimeout(r, 12));
        aiActive--;
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ id: 'bounded', model: 'test-model', output: [{ content: [{ type: 'output_text', text: '{"score":88,"summary":"Good.","checks":[{"label":"Task","passed":true}]}' }] }] }) };
    };
    try {
        const p = createProviders({ OPENAI_API_KEY: 'test', OPENAI_MODEL: 'test-model', OPENAI_MAX_CONCURRENCY: '3' });
        const out = await Promise.all(Array.from({ length: 15 }, (_, i) => p.grade({ language: 'python', modality: 'problem-solving', question: { id: `q${i}`, prompt: 'Print 1', starter_code: '' }, code: 'print(1)', explanation: '', execution: { status: 'Accepted', stdout: '1\n', stderr: '', compileOutput: '' }, expectedConcepts: [] })));
        assert.equal(out.length, 15);
        assert.equal(aiMax, 3);
    } finally { globalThis.fetch = original; }

    let postActive = 0, postMax = 0, tokenCounter = 0;
    globalThis.fetch = async (url, opts = {}) => {
        if (opts.method === 'POST') {
            postActive++; postMax = Math.max(postMax, postActive);
            await new Promise(r => setTimeout(r, 12));
            postActive--;
            return { ok: true, status: 201, json: async () => ({ token: `bounded-${++tokenCounter}` }) };
        }
        return { ok: true, status: 200, json: async () => ({ status: { id: 3, description: 'Accepted' }, stdout: Buffer.from('ok').toString('base64'), time: '0.01', memory: 1 }) };
    };
    try {
        const p = createProviders({ EXECUTION_PROVIDER: 'judge0', JUDGE0_URL: 'https://bounded-sandbox.example', JUDGE0_PYTHON_ID: '71', JUDGE0_JAVA_ID: '62', JUDGE0_MAX_CONCURRENCY: '4' });
        const out = await Promise.all(Array.from({ length: 12 }, () => p.execute('python', 'print(1)', '')));
        assert.equal(out.length, 12);
        assert.equal(postMax, 4);
    } finally { globalThis.fetch = original; }
});
