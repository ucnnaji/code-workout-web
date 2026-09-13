import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
let count = 0;
for (const dir of ['.', 'lib', 'public', 'scripts', 'tests'])
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
        if (!entry.isFile())
            continue;
        const file = path.join(root, dir, entry.name);
        if (/\.(mjs|js)$/.test(entry.name)) {
            const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
            if (r.status)
                throw new Error(r.stderr);
            count++;
        }
        if (entry.name.endsWith('.json'))
            JSON.parse(readFileSync(file, 'utf8'));
    }

const migrationSource = readFileSync(path.join(root, 'migrations/002_workflow.sql'), 'utf8');
if (/if\s+n\s*<>\s*case/i.test(migrationSource))
    throw new Error('migrations/002_workflow.sql contains the old unparenthesized CASE expression.');
const generatedMigrations = ['supabase_upgrade.sql', 'supabase_workflow.sql', 'supabase_setup.sql'].map(name => readFileSync(path.join(root, name), 'utf8'));
if (!generatedMigrations.every(sql => sql === generatedMigrations[0]))
    throw new Error('Generated Supabase migration entry points are out of sync. Run node scripts/build-migration.mjs.');
if (!generatedMigrations[0].includes("if n <> (\n        case"))
    throw new Error('Generated Supabase migration does not contain the corrected question-count CASE expression.');

const { defaultConfig, validateConfig } = await import('../lib/study.mjs');
validateConfig(defaultConfig);
const html = readFileSync(path.join(root, 'public/index.html'), 'utf8');
if (/Optional Program Input|id=["']stdin/.test(html))
    throw new Error('Old raw input UI remains.');
console.log(`Syntax checks passed for ${count} JavaScript files; draft configuration is valid.`);
