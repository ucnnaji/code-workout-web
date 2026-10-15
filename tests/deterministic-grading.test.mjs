import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviders } from '../lib/providers.mjs';

const q = { id: 'PB-PY-1C', starter_code: 'print("should not influence grade")', prompt: 'Temperature Match' };
const run = (answer, question = q) => createProviders({}).grade({ language: question.id.includes('JA') ? 'java' : 'python', modality: 'code-explanation', question, explanation: answer, code: 'print("not evidence")' });

test('Temperature Match same vague answer is stable across 20 separate grading instances without OpenAI', async () => {
 const a = 'The program calculates the difference and uses if-elif-else statements to print a message. It checks the conditions and compares the estimate with the target to determine the result.';
 const grades = await Promise.all(Array.from({length:20}, () => run(a)));
 assert.deepEqual(new Set(grades.map(x => JSON.stringify([x.score,x.checks]))).size, 1);
 assert.equal(grades[0].score,0);
 assert.deepEqual(grades[0].checks.map(c=>c.passed), [false,false,false,false]);
});

test('All four correct criteria give exactly 100 with identical checked boxes', async () => {
 const a = 'abs gives the absolute nonnegative distance from the target, even when the reading is below it. The first if-elif-else prints Perfect match at difference 0, Very close for 1-2, Close for 3-5, otherwise Needs adjustment for more than 5. The conditions are checked in order starting with the exact and smaller threshold first, before the larger thresholds, so the first matching branch wins. The second structure compares the reading to target: below if reading is lower, above if higher, equal if same.';
 const grades = await Promise.all(Array.from({length:12}, () => run(a)));
 for(const g of grades) { assert.equal(g.score,100); assert.deepEqual(g.checks.map(c=>c.passed),[true,true,true,true]); }
});

test('One demonstrably correct criterion yields precisely 25', async () => {
 const g = await run('abs computes the nonnegative magnitude of the difference, meaning how far the measurement is from the target regardless of sign.');
 assert.equal(g.score,25);assert.deepEqual(g.checks.map(c=>c.passed),[true,false,false,false]);
});

test('Java Temperature Match uses exactly the same criterion weights', async () => {
 const g = await run('Math.abs makes the distance nonnegative regardless of sign.', { id:'PB-JA-1C' });
 assert.equal(g.score,25);
});

test('Starter code cannot earn checklist credit without an explanation', async () => {
 const g= await run('');assert.equal(g.score,0);
});
