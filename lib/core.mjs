import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
const scrypt = promisify(crypto.scrypt);
export const MODALITIES = ['problem-solving', 'debugging', 'code-explanation'];
export const LABELS = { 'problem-solving': 'Problem Solving', debugging: 'Debugging', 'code-explanation': 'Code Explanation' };
export const STAGES = ['information', 'consent', 'language', 'pre_survey', 'demo', 'coding', 'post_survey', 'incentive', 'completion'];
export const STAGE_LABELS = { information: 'Research information', consent: 'Consent', pre_survey: 'Pre-survey', demo: 'Practice environment demo', language: 'Language', coding: 'Coding', post_survey: 'Post-survey', incentive: 'Incentive', completion: 'Completion' };
export const EXPORT_TABLES = ['participants', 'sessions', 'stages', 'assignments', 'submissions', 'operations', 'drafts', 'events', 'modalities'];
export class AppError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
export const fail = (message, status = 400) => { throw new AppError(message, status); };
export function text(v, max = 20000, { trim = false } = {}) {
    if (typeof v !== 'string' || v.length > max)
        fail(`Expected text of at most ${max} characters.`);
    return trim ? v.trim() : v;
}
export function uuid(v) {
    if (typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))
        fail('Invalid identifier.');
    return v;
}
export function participantCode(v) {
    const s = text(v, 64, { trim: true }).toUpperCase();
    if (!/^[A-Z0-9_-]{1,64}$/.test(s))
        fail('Participant ID may contain only letters, numbers, hyphens, and underscores.');
    return s;
}
export function studentParticipantCode(v) {
    const s = text(v, 20, { trim: true }).toUpperCase();
    if (!/^[A-Z0-9_-]{4,20}$/.test(s))
        fail('Choose a Participant ID with 4–20 letters, numbers, hyphens, or underscores.');
    if (/^(?:[0-9]{8,}|A[0-9]{7,}|N[0-9]{7,})$/.test(s))
        fail('Do not use a student number, A-number, or another identifying number as your Participant ID.');
    return s;
}
export function revision(v) {
    if (!Number.isInteger(v) || v < 0)
        fail('Invalid save revision.');
    return v;
}
export function object(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype)
        fail('Expected an object.');
    return v;
}
export const sha256 = v => crypto.createHash('sha256').update(v).digest('hex');
export const canonical = v => JSON.stringify(v === null || typeof v !== 'object' ? v : Array.isArray(v) ? v.map(x => JSON.parse(canonical(x))) : Object.fromEntries(Object.keys(v).sort().map(k => [k, JSON.parse(canonical(v[k]))])));
export const hashObject = v => sha256(canonical(v));
export function safeEqual(a, b) { const x = Buffer.from(a || ''), y = Buffer.from(b || ''); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); }
export async function hashSecret(secret) { const salt = crypto.randomBytes(16); const key = await scrypt(secret, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`; }
export async function verifySecret(secret, hash) {
    try {
        const [alg, salt, key] = hash.split('$');
        if (alg !== 'scrypt' || salt.length !== 32 || key.length !== 64)
            return false;
        const candidate = await scrypt(secret, Buffer.from(salt, 'hex'), 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
        return safeEqual(candidate.toString('hex'), key);
    }
    catch {
        return false;
    }
}
export function seal(value, key, aad) {
    if (!Buffer.isBuffer(key) || key.length !== 32)
        fail('Private-data encryption is not configured.', 503);
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
    c.setAAD(Buffer.from(aad));
    const ciphertext = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
    return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}
export function unseal(envelope, key, aad) { const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64')); d.setAAD(Buffer.from(aad)); d.setAuthTag(Buffer.from(envelope.tag, 'base64')); return JSON.parse(Buffer.concat([d.update(Buffer.from(envelope.ciphertext, 'base64')), d.final()]).toString('utf8')); }
export function email(v) {
    const s = text(v, 254, { trim: true });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || /[\r\n]/.test(s))
        fail('Enter a valid email address.');
    return s;
}
export function serializeInputs(schema, values, { required = true } = {}) {
    object(values);
    const allowed = new Set(schema.map(s => s.id));
    if (Object.keys(values).some(k => !allowed.has(k)))
        fail('Unexpected program input field.');
    const clean = {};
    let lines = [];
    for (const f of schema) {
        let s = values[f.id] ?? f.default ?? '';
        if (typeof s !== 'string' && typeof s !== 'number')
            fail(`Check ${f.label}.`);
        s = String(s);
        if (s.length > 512 || /[\r\n\0]/.test(s))
            fail(`${f.label} must be one value, without line breaks.`);
        if (required && f.required && !s.trim())
            fail(`Enter ${f.label}.`);
        if (required && s.trim() && f.type === 'integer' && !/^-?\d+$/.test(s))
            fail(`${f.label} must be a whole number.`);
        if (required && s.trim() && f.type === 'number' && (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) || !Number.isFinite(Number(s))))
            fail(`${f.label} must be a number.`);
        if (required && s.trim() && f.min != null && Number(s) < f.min)
            fail(`${f.label} is too small.`);
        if (required && s.trim() && f.max != null && Number(s) > f.max)
            fail(`${f.label} is too large.`);
        clean[f.id] = s;
        lines.push(s);
    }
    return { values: clean, stdin: lines.length ? lines.join('\n') + '\n' : '' };
}
export function deterministicPick(ids, seed, label, count) {
    if (new Set(ids).size < count)
        fail('The configured bank has too few unused questions for this session.', 409);
    return [...new Set(ids)].map(id => ({ id, h: crypto.createHmac('sha256', seed).update(label + '|' + id).digest('hex') })).sort((a, b) => a.h.localeCompare(b.h) || a.id.localeCompare(b.id)).slice(0, count).map(x => x.id);
}
export function validateAnswers(definition, answers) {
    object(answers);
    const ids = new Set((definition.items || []).map(i => i.id));
    if (Object.keys(answers).some(k => !ids.has(k)))
        fail('Unexpected survey or test response.');
    const out = {};
    for (const i of definition.items || []) {
        const v = answers[i.id];
        if (v === undefined || v === null || v === '') {
            out[i.id] = null;
            continue;
        }
        if (i.type === 'text')
            out[i.id] = text(v, 3000);
        else if (i.type === 'multi') {
            if (!Array.isArray(v) || v.length > i.options.length || new Set(v).size !== v.length || v.some(x => !i.options.includes(x)))
                fail(`Check the response for: ${i.label}`);
            out[i.id] = v;
        }
        else {
            if (!i.options.includes(v))
                fail(`Check the response for: ${i.label}`);
            out[i.id] = v;
        }
    }
    return out;
}
export function scoreAssessment(def, answers) { const items = def.items || [], answered = items.filter(i => answers[i.id] != null); return { version: def.version, nItems: items.length, nAnswered: answered.length, nSkipped: items.length - answered.length, earned: answered.length ? answered.reduce((n, i) => n + (answers[i.id] === i.answer ? (i.points || 1) : 0), 0) : null, maximum: items.reduce((n, i) => n + (i.points || 1), 0), skippedItems: items.filter(i => answers[i.id] == null).map(i => i.id) }; }
export function scoreSelfEfficacy(def, answers) { const items = (def.items || []).filter(i => i.id.startsWith('se_')), values = items.filter(i => answers[i.id] != null).map(i => i.options.indexOf(answers[i.id]) + 1); return { instrument: def.version, nExpected: items.length, nAnswered: values.length, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, note: 'Descriptive mean of answered self-efficacy items only; not a validated composite or an imputed score.' }; }
export function publicDefinition(def, language) {
    let d = structuredClone(def);
    if (d.variants) {
        d = { ...d, ...d.variants[language || 'python'] };
        delete d.variants;
    }
    if (d.items)
        d.items = d.items.map(({ answer, points, ...item }) => item);
    return d;
}
export function csvCell(v) {
    let s = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
    if (/^[\s]*[=+\-@\t\r]/.test(s))
        s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
}
export function spreadsheetCell(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'object') v = JSON.stringify(v);
    if (typeof v === 'string' && /^[\s]*[=+\-@\t\r]/.test(v)) return "'" + v;
    return v;
}
export function toCSV(rows) {
    if (!rows.length)
        return '';
    const keys = [...new Set(rows.flatMap(Object.keys))];
    return '\ufeff' + [keys.map(csvCell).join(','), ...rows.map(r => keys.map(k => csvCell(r[k])).join(','))].join('\r\n');
}
export const html = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function loadJSON(path) { return JSON.parse(readFileSync(path, 'utf8')); }
