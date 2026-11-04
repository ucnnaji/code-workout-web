import {writeFileSync} from 'node:fs';
import {questionBankHash,questionBankRelease} from '../lib/study.mjs';
const r3=questionBankRelease.filter(q=>q.question_set_version==='PB3-R3');
if(r3.length!==80)throw new Error(`Expected 80 Session 3 R3 definitions, received ${r3.length}`);
const sqlText=value=>`'${String(value??'').replaceAll("'","''")}'`;
const rows=r3.map(q=>`(${sqlText(q.id)},${sqlText(q.language)},${sqlText(q.modality_id)},${sqlText(q.title)},${sqlText(q.prompt)},${sqlText(q.starter_code)},${sqlText(q.difficulty)},${sqlText(JSON.stringify(q.expected_concepts))}::jsonb,true)`);
const script=`-- PracticeBridge: additive Session 3 R3 question bank release.\n`+
`-- Designed for a database already upgraded to workflow v4 with cw_question_banks.\n`+
`-- Back up your database, verify in staging, and run this SQL ONE TIME in your chosen environment.\n`+
`-- This script never changes earlier question IDs, participant sessions, or past answers.\n`+
`-- New sessions use bank hash: ${questionBankHash}\n`+
`BEGIN;\nINSERT INTO public.questions (id,language,modality_id,title,prompt,starter_code,difficulty,expected_concepts,active) VALUES\n`+
`${rows.join(',\n')}\nON CONFLICT (id) DO UPDATE SET\n  language=EXCLUDED.language, modality_id=EXCLUDED.modality_id, title=EXCLUDED.title,\n  prompt=EXCLUDED.prompt, starter_code=EXCLUDED.starter_code, difficulty=EXCLUDED.difficulty,\n  expected_concepts=EXCLUDED.expected_concepts, active=EXCLUDED.active;\n`+
`INSERT INTO public.cw_question_banks (bank_hash,definitions) VALUES (`+
`${sqlText(questionBankHash)},${sqlText(JSON.stringify(questionBankRelease))}::jsonb) ON CONFLICT (bank_hash) DO NOTHING;\n`+
`COMMIT;\n`+
`SELECT language,modality_id,count(*) FROM public.questions WHERE active AND id LIKE 'PB3-%-R3' GROUP BY language,modality_id ORDER BY language,modality_id;\n`;
writeFileSync(new URL('../migrations/003_session3_r3.sql',import.meta.url),script);
console.log(`Built additive Session 3 R3 release SQL: ${r3.length} items; bank hash ${questionBankHash.slice(0,12)}.`);
