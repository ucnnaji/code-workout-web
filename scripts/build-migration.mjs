import { readFileSync, writeFileSync } from 'node:fs';
import { hashObject } from '../lib/core.mjs';
const root = new URL('../', import.meta.url);
const questions = JSON.parse(readFileSync(new URL('questions.seed.json', root), 'utf8'));
const inputSchemas = JSON.parse(readFileSync(new URL('content/input-schemas.json', root), 'utf8'));
const questionRelease = questions.map(q => ({
    ...q,
    active: typeof q.active === 'boolean' ? q.active : q.modality_id !== 'code-completion',
    inputSchema: inputSchemas.questions?.[q.id] || []
}));
const questionBankHash = hashObject(questionRelease);
const sqlText = value => `'${String(value ?? '').replaceAll("'", "''")}'`;
const rows = questionRelease.map(q =>
    `(${sqlText(q.id)},${sqlText(q.language)},${sqlText(q.modality_id)},${sqlText(q.title)},${sqlText(q.prompt)},${sqlText(q.starter_code)},${sqlText(q.difficulty)},${sqlText(JSON.stringify(q.expected_concepts || []))}::jsonb,${q.active ? 'true' : 'false'})`
);
const canonicalSeed = `-- Canonical question bank generated from questions.seed.json.\n-- Edit that JSON file (keep stable IDs for revised questions), run npm run build:verify,\n-- then run the regenerated supabase_upgrade.sql. Existing participant assignments keep\n-- their immutable question_snapshot and are not rewritten.\ninsert into public.questions\n  (id, language, modality_id, title, prompt, starter_code, difficulty, expected_concepts, active)\nvalues\n${rows.join(',\n')}\non conflict (id) do update set\n  language = excluded.language,\n  modality_id = excluded.modality_id,\n  title = excluded.title,\n  prompt = excluded.prompt,\n  starter_code = excluded.starter_code,\n  difficulty = excluded.difficulty,\n  expected_concepts = excluded.expected_concepts,\n  active = excluded.active;\n\n-- Code Completion remains retired unless deliberately re-enabled in questions.seed.json.\n`;
let legacy = readFileSync(new URL('migrations/001_legacy.sql', root), 'utf8');
legacy = legacy.replace(/create unique index if not exists one_active_session_per_participant\s+on public\.study_sessions\(participant_id\) where status = 'active';/, '-- v3 supports distinct waves; no single-active-session index.');
const seedStart = legacy.indexOf('insert into public.questions');
const integrityStart = legacy.indexOf('-- Helpful integrity check.');
if (seedStart < 0 || integrityStart < seedStart) throw new Error('Cannot locate legacy question seed section.');
legacy = legacy.slice(0, seedStart) + canonicalSeed + '\n' + legacy.slice(integrityStart);
legacy = legacy.slice(0, legacy.indexOf('-- Helpful integrity check.'));
const header = `-- CODE WORKOUT v4.0.4: additive, idempotent schema and bootstrap.\n-- Back up first. Run the ENTIRE file in the Supabase SQL Editor as project owner.\n-- Existing research records and historical assignment snapshots are preserved.\n-- Current question definitions are synchronized from questions.seed.json by stable ID.\n-- DO NOT run migrations/001_legacy.sql on its own after upgrading.\nBEGIN;\n`;
const releaseSql = `\n-- Versioned immutable question-bank release. Sessions store this hash, so future\n-- question edits cannot silently change an already-started session.\ninsert into public.cw_question_banks(bank_hash,definitions)\nvalues(${sqlText(questionBankHash)},${sqlText(JSON.stringify(questionRelease))}::jsonb)\non conflict(bank_hash) do nothing;\n\n-- v4.0.4 migration: freeze the bank used by sessions created before this release.\nupdate public.study_sessions\nset protocol_snapshot=jsonb_set(protocol_snapshot,'{questionBankHash}',to_jsonb(${sqlText(questionBankHash)}::text),true)\nwhere workflow_version is not null and protocol_snapshot is not null and not (protocol_snapshot ? 'questionBankHash');\n`;
const sql = header + legacy + '\n' + readFileSync(new URL('migrations/002_workflow.sql', root), 'utf8') + releaseSql + '\nCOMMIT;\n\nSELECT language, modality_id, count(*) AS question_count FROM public.questions WHERE active AND modality_id IN (\'problem-solving\',\'debugging\',\'code-explanation\') GROUP BY language, modality_id ORDER BY language, modality_id;\n';
for (const name of ['supabase_workflow.sql', 'supabase_upgrade.sql', 'supabase_setup.sql']) writeFileSync(new URL(name, root), sql);
console.log(`Built three identical entry-point migrations from ${questions.length} canonical question definitions (bank ${questionBankHash.slice(0, 12)}). Run only one.`);
