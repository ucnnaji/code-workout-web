import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, defaultConfig, validateConfig } from '../lib/study.mjs';
import { validateAnswers } from '../lib/core.mjs';

test('both surveys are present and all their items are required in both languages and all sessions', () => {
  for (const number of [1,2,3]) {
    const snapshot = buildSnapshot(defaultConfig, number, 'required-survey-test-participant');
    for (const phase of ['pre_survey','post_survey']) {
      const stage = snapshot.stages.find(s => s.key === phase);
      assert.equal(stage.enabled, true);
      for (const lang of ['python','java']) {
        const def = stage.variants[lang];
        assert.ok(def.items.length > 0);
        assert.ok(def.items.every(item => item.required === true));
      }
    }
  }
});

test('course enrollment question preserves both course options across languages', () => {
  const snapshot = buildSnapshot(defaultConfig, 1, 'required-survey-test-participant');
  const stage = snapshot.stages.find(s => s.key === 'pre_survey');
  for (const lang of ['python','java']) {
    const q = stage.variants[lang].items.find(i => i.id === 'usu_cs_course');
    assert.ok(q);
    assert.equal(q.required, true);
    assert.ok(q.options.includes('Yes, CS 1400'));
    assert.ok(q.options.includes('Yes, CS 1410'));
    assert.ok(q.options.includes('No'));
  }
});

test('required survey stages cannot be disabled by configuration', () => {
  for (const stage of ['pre_survey','post_survey']) {
    const cfg = structuredClone(defaultConfig);
    cfg.stages[stage] = false;
    assert.throws(() => validateConfig(cfg), /Pre-survey and post-survey must be enabled/);
  }
});
