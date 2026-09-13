import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { hashSecret, verifySecret } from '../lib/core.mjs';
import { createProviders } from '../lib/providers.mjs';

const users = Math.max(1, Math.min(2000, Number(process.env.LOAD_USERS || 500) || 500));
const results = {};
async function timed(name, fn) {
  const start = performance.now();
  const detail = await fn();
  results[name] = { milliseconds: Math.round(performance.now() - start), ...detail };
}

await timed(`${users} concurrent access-key verifications`, async () => {
  const hash = await hashSecret('CW-LOAD-TEST-KEY');
  const values = await Promise.all(Array.from({ length: users }, () => verifySecret('CW-LOAD-TEST-KEY', hash)));
  assert.ok(values.every(Boolean));
  return { completed: values.length };
});

await timed(`${users} concurrent AI scoring requests through bounded provider gate`, async () => {
  const original = globalThis.fetch;
  let active = 0, maxActive = 0, calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++; active++; maxActive = Math.max(maxActive, active);
    await new Promise(r => setTimeout(r, 8));
    active--;
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ id: `r-${calls}`, model: 'load-model', output: [{ content: [{ type: 'output_text', text: '{"score":90,"summary":"Correct overall.","checks":[{"label":"Task","passed":true}]}' }] }] }) };
  };
  try {
    const p = createProviders({ OPENAI_API_KEY: 'test', OPENAI_MODEL: 'load-model' });
    const grades = await Promise.all(Array.from({ length: users }, (_, i) => p.grade({ language: 'python', modality: 'problem-solving', question: { id: `q${i}`, prompt: 'Print 1', starter_code: '' }, code: 'print(1)', explanation: '', execution: { status: 'Accepted', stdout: '1\n', stderr: '', compileOutput: '' }, expectedConcepts: ['print'] })));
    assert.equal(grades.length, users); assert.ok(grades.every(x => x.score === 90)); assert.ok(maxActive <= 120);
    return { completed: grades.length, outboundCalls: calls, maxConcurrentOutboundCalls: maxActive };
  } finally { globalThis.fetch = original; }
});

await timed(`${users} concurrent Judge0 executions with one shared runtime discovery`, async () => {
  const original = globalThis.fetch;
  let languageCalls = 0, postCalls = 0, pollCalls = 0, activePosts = 0, maxActivePosts = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.endsWith('/languages')) { languageCalls++; await new Promise(r => setTimeout(r, 15)); return { ok: true, status: 200, json: async () => [{ id: 71, name: 'Python (3.11.0)' }, { id: 62, name: 'Java (OpenJDK 17)' }] }; }
    if (opts.method === 'POST') { postCalls++; activePosts++; maxActivePosts = Math.max(maxActivePosts, activePosts); await new Promise(r => setTimeout(r, 5)); activePosts--; return { ok: true, status: 201, json: async () => ({ token: `t-${postCalls}` }) }; }
    pollCalls++; return { ok: true, status: 200, json: async () => ({ status: { id: 3, description: 'Accepted' }, stdout: Buffer.from('ok\n').toString('base64'), stderr: null, compile_output: null, message: null, time: '0.01', memory: 1000 }) };
  };
  try {
    const p = createProviders({ EXECUTION_PROVIDER: 'judge0', JUDGE0_URL: 'https://load-sandbox.example' });
    const runs = await Promise.all(Array.from({ length: users }, () => p.execute('python', 'print("ok")', '')));
    assert.equal(runs.length, users); assert.equal(languageCalls, 1); assert.equal(postCalls, users); assert.ok(maxActivePosts <= 120);
    return { completed: runs.length, languageDiscoveryCalls: languageCalls, submissions: postCalls, polls: pollCalls, maxConcurrentSubmissions: maxActivePosts };
  } finally { globalThis.fetch = original; }
});

console.log(JSON.stringify({ ok: true, syntheticUsers: users, results, caveat: 'Synthetic process-level test with mocked external services; not a capacity guarantee for Render, Supabase, OpenAI, or Judge0.' }, null, 2));
