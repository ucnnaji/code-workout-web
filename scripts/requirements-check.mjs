import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defaultConfig, buildSnapshot } from '../lib/study.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const html = read('public/index.html'), app = read('public/app.js'), admin = read('public/admin.js'), adminHtml = read('public/admin.html'), css = read('public/styles.css'), server = read('lib/app.mjs'), providers = read('lib/providers.mjs'), migration = read('migrations/002_workflow.sql');
const sha256 = value => createHash('sha256').update(value).digest('hex');
assert.equal(sha256(read('content/consent.json')), '902c673fdd0524cd6d41ac18280370e8dd1f50406eabe4efa89334837d3c0f05', 'Current consent wording changed unexpectedly.');
const questions = JSON.parse(read('questions.seed.json'));
assert.ok(Array.isArray(questions) && questions.length >= 36, 'Question bank is unexpectedly small.');
assert.equal(new Set(questions.map(q => q.id)).size, questions.length, 'Question IDs must be unique.');
for (const q of questions) {
    assert.match(q.id, /^[A-Z0-9_-]+$/, `Invalid question ID: ${q.id}`);
    assert.ok(['python','java'].includes(q.language), `Invalid language for ${q.id}`);
    assert.ok(['problem-solving','debugging','code-explanation','code-completion'].includes(q.modality_id), `Invalid modality for ${q.id}`);
    for (const field of ['title','prompt','starter_code','difficulty']) assert.equal(typeof q[field], 'string', `Missing ${field} for ${q.id}`);
    assert.ok(Array.isArray(q.expected_concepts), `expected_concepts must be an array for ${q.id}`);
}
for (const language of ['python','java']) for (const modality of ['problem-solving','debugging','code-explanation'])
    assert.ok(questions.filter(q => q.language === language && q.modality_id === modality).length >= 6, `${language}/${modality} needs at least six questions to support three nonrepeating sessions.`);
assert.equal(defaultConfig.activityDesign, 'assigned_crossover');
assert.equal(defaultConfig.preventDuplicateEntries, true);
assert.equal(defaultConfig.sessions.some(s => Object.hasOwn(s, 'topic')), false);
const snapshot = buildSnapshot(defaultConfig, 1, '00000000-0000-4000-8000-000000000001').snapshot;
assert.equal(snapshot.modalityOrder.reduce((n,m) => n + (snapshot.modalityOrder[0] === m ? 2 : 1), 0), 4);
assert.equal(snapshot.stages.find(s => s.key === 'language').ordinal < snapshot.stages.find(s => s.key === 'pre_survey').ordinal, true, 'Language selection must occur before the pre-survey.');
assert.doesNotMatch(html, /name="accessLanguage"/, 'Language choice must not be duplicated on the access-key screen.');
assert.match(html, /consent-scroll/, 'Consent should use the compact scrollable reader.');
assert.match(html, /id="loadingScreen"/); assert.match(html, /id="accessSetupScreen"/); assert.match(html, /id="scoreBox"/); assert.match(html, /id="checkExplanation"/);
assert.match(app, /outputPanel'\)\.classList\.toggle\('hidden', isExplanation\)/); assert.match(app, /explanationSection'\)\.classList\.toggle\('hidden', !isExplanation\)/); assert.match(app, /Continue to practice activities/);
assert.doesNotMatch(app, /supplied-main-consent/);
assert.match(css, /\.editor-host\{height:300px;min-height:240px;max-height:360px/);
assert.match(server, /\/api\/participants\/self-enroll/); assert.match(server, /remoteLiveStudyEnabled/); assert.match(server, /participantLiveStudyEnabled/); assert.match(server, /surveyExportNames/); assert.match(server, /preventDuplicateEntries/); assert.match(server, /cw_entry_lock/); assert.match(server, /hasValidEntryLock/); assert.match(server, /setEntryLock\(res\)/);
assert.match(providers, /https:\/\/ce\.judge0\.com/); assert.match(providers, /\/languages/); assert.match(providers, /async grade/); assert.match(providers, /ai-rubric-all-modalities-v2/); assert.doesNotMatch(providers, /execution-gated-ai-rubric/);
assert.match(adminHtml, /toggleDuplicateProtection/); assert.match(adminHtml, /releaseReadiness/); assert.match(admin, /pre-post-surveys/); assert.match(admin, /reviewedContentHash === currentHash/);
for (const term of ['loops', 'functions', 'arrays']) { assert.doesNotMatch(read('config/study.json').toLowerCase(), new RegExp(`\\b${term}\\b`)); assert.doesNotMatch(app.toLowerCase(), new RegExp(`\\b${term}\\b`)); }
assert.match(server, /contentHashForConfig/); assert.doesNotMatch(server, /topicValidation:/); assert.match(server, /publicQuestionSnapshot/); assert.match(server, /RATE_LIMITS/); assert.match(server, /selfEnrollIpPerHour: 1200/); assert.match(server, /loginIpPer15Min: 2000/); assert.doesNotMatch(server, /Version \$/);
assert.match(migration, /align them with the supplied in-person consent/);
assert.match(migration, /entry_locked_at/); assert.match(migration, /final_score/); assert.match(migration, /score_details/); assert.match(migration, /'execute','feedback','score'/); assert.match(migration, /cw_operations_assignment_recent/);
console.log('Requested-modification regression checks passed.');
