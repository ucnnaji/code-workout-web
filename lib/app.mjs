import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, fail, text, uuid, revision, participantCode, studentParticipantCode, object, sha256, hashObject, safeEqual, hashSecret, verifySecret, seal, unseal, email, serializeInputs, deterministicPick, validateAnswers, scoreAssessment, scoreSelfEfficacy, publicDefinition, toCSV, spreadsheetCell, html, MODALITIES, LABELS, EXPORT_TABLES, STAGES } from './core.mjs';
import { defaultConfig, validateConfig, buildSnapshot, canRunLive, canRunRemoteLiveStudy, releaseBlockers, inputSchemas, assignmentCount, bankCandidates, contentHashForConfig, consentDocument } from './study.mjs';
import { createProviders } from './providers.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const cookieName = 'cw_access';
const entryLockCookieName = 'cw_entry_lock';
const clientOperation = o => ({ id: o.id, kind: o.kind, requestNumber: o.request_number, status: o.status, result: o.result, requestedAt: o.requested_at, completedAt: o.completed_at, displayedAt: o.displayed_at });
// Campus participants can share one public/NAT address. Keep IP limits high enough for a
// scheduled lab while retaining stricter participant-ID/account limits against brute force.
const RATE_LIMITS = Object.freeze({ selfEnrollIpPerHour: 1200, selfEnrollCodePerHour: 5, loginIpPer15Min: 2000, loginCodePer15Min: 10, participantPer15Min: 1200 });
function publicQuestionSnapshot(question = {}) { const { expected_concepts, expectedConcepts, topicValidation, ...safe } = question || {}; return safe; }
function publicAssignment(assignment) { return assignment ? { ...assignment, question_snapshot: publicQuestionSnapshot(assignment.question_snapshot) } : assignment; }
function publicCodingPayload(payload) {
    if (!payload) return payload;
    const safe = { ...payload };
    if (safe.assignment) safe.assignment = publicAssignment(safe.assignment);
    if (Array.isArray(safe.review)) safe.review = safe.review.map(item => ({ ...item, assignment: publicAssignment(item.assignment) }));
    return safe;
}
export function createApp({ db, env = process.env, providers = createProviders(env), startupIssues = [] }) {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', 1);
    const encryptionKey = Buffer.from(env.PII_ENCRYPTION_KEY || '', 'base64');
    let origin = null;
    try { origin = env.PUBLIC_ORIGIN ? new URL(env.PUBLIC_ORIGIN).origin : null; } catch { origin = null; }
    const tokenForRole = { research: env.ADMIN_TOKEN, payment: env.COMPENSATION_ADMIN_TOKEN };
    let configCache = null, configCacheUntil = 0, configPromise = null, lastRateCleanup = 0;
    app.use((req, res, next) => {
        res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'X-Permitted-Cross-Domain-Policies': 'none', 'Cross-Origin-Resource-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cross-Origin-Opener-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob: data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
        if (env.NODE_ENV === 'production')
            res.set('Strict-Transport-Security', 'max-age=31536000');
        if (req.path.startsWith('/api') || req.path === '/health')
            res.set('Cache-Control', 'no-store');
        next();
    });
    app.use(express.json({ limit: '128kb', strict: true }));
    app.use('/api', (req, res, next) => {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            if (!req.is('application/json'))
                return next(new AppError('JSON content is required.', 415));
            const actual = req.get('Origin');
            if (actual && actual !== (origin || `${req.protocol}://${req.get('host')}`))
                return next(new AppError('Cross-origin requests are not accepted.', 403));
        }
        next();
    });
    const invalidateConfigCache = () => { configCache = null; configCacheUntil = 0; };
    const getConfig = async () => {
        const now = Date.now();
        if (configCache && now < configCacheUntil) return configCache;
        if (configPromise) return configPromise;
        configPromise = (async () => {
            let x = await db.call('config_get', { studyKey: defaultConfig.studyKey });
            if (!x) x = await db.call('config_init', { studyKey: defaultConfig.studyKey, config: defaultConfig });
            if (!x) throw new AppError('Study configuration could not be initialized.', 503);
            configCache = x;
            configCacheUntil = Date.now() + 1000;
            return x;
        })();
        try { return await configPromise; }
        finally { configPromise = null; }
    };
    async function rate(req, key, limit, seconds = 900) {
        if (encryptionKey.length !== 32)
            fail('Private-data encryption must be configured.', 503);
        const bucket = crypto.createHmac('sha256', encryptionKey).update(`rate-v1|${key}`).digest('hex');
        const cleanup = Date.now() - lastRateCleanup > 10 * 60 * 1000;
        if (cleanup) lastRateCleanup = Date.now();
        const r = await db.call('rate', { bucket, limit, seconds, cleanup });
        if (!r.allowed)
            fail('Too many requests. Please wait before trying again.', 429);
    }
    const admin = role => async (req, res, next) => {
        try {
            await rate(req, `admin|${req.ip}`, 100);
            const supplied = req.get('X-Admin-Token') || '';
            if (!tokenForRole[role] || !safeEqual(supplied, tokenForRole[role]))
                fail('Administrator access is required.', 401);
            next();
        }
        catch (e) {
            next(e);
        }
    };
    const cookie = (res, token) => res.cookie(cookieName, token, { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 });
    const cookieValue = (req, name) => (req.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) || '';
    const cookieToken = req => cookieValue(req, cookieName);
    const createEntryLock = () => {
        if (encryptionKey.length !== 32) return '';
        const nonce = crypto.randomBytes(24).toString('base64url');
        const mac = crypto.createHmac('sha256', encryptionKey).update(`entry-lock-v1|${nonce}`).digest('base64url');
        return `${nonce}.${mac}`;
    };
    const hasValidEntryLock = req => {
        if (encryptionKey.length !== 32) return false;
        const value = cookieValue(req, entryLockCookieName), [nonce, mac, extra] = value.split('.');
        if (extra !== undefined || !/^[A-Za-z0-9_-]{32}$/.test(nonce || '') || !/^[A-Za-z0-9_-]{43}$/.test(mac || '')) return false;
        const expected = crypto.createHmac('sha256', encryptionKey).update(`entry-lock-v1|${nonce}`).digest('base64url');
        return safeEqual(mac, expected);
    };
    const setEntryLock = res => {
        const value = createEntryLock();
        if (value) res.cookie(entryLockCookieName, value, { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 400 * 24 * 60 * 60 * 1000 });
    };
    const generateAccessKey = () => {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', bytes = crypto.randomBytes(16);
        const chars = [...bytes].map(b => alphabet[b % alphabet.length]).join('');
        return chars.match(/.{1,4}/g).join('-');
    };
    async function auth(req, res, next) {
        try {
            const token = cookieToken(req);
            if (!/^[A-Za-z0-9_-]{43}$/.test(token))
                fail('Sign in to continue.', 401);
            const a = await db.call('token_get', { hash: sha256(token) });
            if (!a)
                fail('Your sign-in has expired. Sign in again to resume.', 401);
            req.auth = { ...a, token, csrf: sha256(`csrf:${token}`) };
            if (!['GET', 'HEAD'].includes(req.method) && !safeEqual(req.get('X-CSRF-Token') || '', req.auth.csrf))
                fail('Refresh the page before saving.', 403);
            await rate(req, `participant|${a.pid}`, RATE_LIMITS.participantPer15Min);
            next();
        }
        catch (e) {
            next(e);
        }
    }
    const params = (req, sid) => ({ pid: req.auth.pid, sid: uuid(sid) });
    async function rawState(req, sid) {
        const d = await db.call('state', params(req, sid));
        if (!d.session.is_test && (env.LIVE_COLLECTION_ENABLED !== 'true' || startupIssues.length))
            fail('Live collection is paused. Your saved data has not changed.', 503);
        return d;
    }
    function stateForClient(d) {
        const s = d.session, cfg = s.protocol_snapshot.config, order = s.protocol_snapshot.modalityOrder || MODALITIES;
        const done = new Set((d.modalities || []).map(x => x.modality_id));
        return {
            session: { id: s.id, participantId: s.participant_id, number: s.session_number, label: s.session_label, language: s.language, status: s.status, isTest: s.is_test, startedAt: s.started_at, completedAt: s.completed_at, consentedAt: s.consented_at, entryLockedAt: s.entry_locked_at },
            currentStage: d.current || 'completion',
            stages: d.stages.map(({ stage_key, ordinal, status, revision, first_viewed_at, completed_at, active_seconds }) => ({ key: stage_key, ordinal, status, revision, firstViewedAt: first_viewed_at, completedAt: completed_at, activeSeconds: active_seconds })),
            modalityOrder: order,
            modalities: order.map(id => ({ id, label: LABELS[id], completed: done.has(id), count: assignmentCount(s.protocol_snapshot, id), locked: cfg.activityDesign === 'assigned_crossover' && order.slice(0, order.indexOf(id)).some(m => !done.has(m)) })),
            config: { title: cfg.title, contact: cfg.contact, durationText: cfg.durationText, languages: cfg.languages, deliveryMode: cfg.deliveryMode, activityDesign: cfg.activityDesign, aiEnabled: cfg.aiEnabled, aiModalities: cfg.aiModalities, feedbackTypes: cfg.feedbackTypes, executionEnabled: cfg.executionEnabled, preventDuplicateEntries: cfg.preventDuplicateEntries, compensation: cfg.compensation },
            contentHash: s.protocol_snapshot.contentHash
        };
    }
    function requireCurrent(d, stage) {
        if (d.session.status !== 'active' || d.current !== stage)
            fail('Complete the current stage first.', 409);
    }
    const getStage = (d, key) => d.stages.find(s => s.stage_key === key) || fail('Unknown study stage.', 404);
    function privateDefinition(st, language) { return st.definition.variants ? { ...st.definition, ...st.definition.variants[language || 'python'] } : st.definition; }
    const liveSwitchEnabled = () => env.LIVE_COLLECTION_ENABLED === 'true';
    const remoteLiveStudyEnabled = config => canRunRemoteLiveStudy(config, liveSwitchEnabled(), startupIssues.length === 0);
    const participantLiveStudyEnabled = config => startupIssues.length === 0 && liveSwitchEnabled() && (config.deliveryMode === 'remote' || canRunLive(config));
    const healthPayload = async () => {
        let database = false, databaseError = null, collectionMode = 'test-only';
        try {
            const c = await getConfig();
            database = true;
            collectionMode = participantLiveStudyEnabled(c.config) ? 'live-enabled' : 'test-only';
        }
        catch (e) { databaseError = e instanceof AppError ? e.message : 'Database readiness check failed.'; }
        return { ok: true, process: true, database, workflowVersion: '4.0.0', appVersion: '4.0.5', collectionMode, setupReady: database && startupIssues.length === 0, setupIssues: startupIssues, databaseError };
    };
    // Render uses this liveness endpoint. A missing migration should not kill the web process.
    app.get('/healthz', (req, res) => res.json({ ok: true, process: true, appVersion: '4.0.5' }));
    // Human-readable deployment diagnostics; always 200 so it can be opened even during setup.
    app.get('/health', async (req, res) => res.json(await healthPayload()));
    // Strict readiness endpoint for diagnostics/monitoring that should fail until Supabase is ready.
    app.get('/readyz', async (req, res) => {
        const payload = await healthPayload();
        res.status(payload.setupReady ? 200 : 503).json(payload);
    });
    app.get('/api/public', async (req, res, next) => {
        try {
            const { config: c } = await getConfig();
            const liveEnrollmentOpen = remoteLiveStudyEnabled(c);
            res.json({ title: c.title, contact: c.contact, consent: consentDocument, durationText: c.durationText, compensation: c.compensation, notice: c.contentNotice || 'Welcome! Click Continue to continue with the study.', liveEnrollmentOpen, preventDuplicateEntries: c.preventDuplicateEntries === true, languages: c.languages });
        }
        catch (e) {
            next(e);
        }
    });
    app.post('/api/participants/self-enroll', async (req, res, next) => {
        try {
            const { config } = await getConfig();
            const liveSwitch = liveSwitchEnabled();
            if (startupIssues.length) fail('Live enrollment is unavailable because deployment setup is incomplete. Please contact the research team.', 503);
            // Remote participants can create their own study credentials when the deployment
            // switch is enabled. The release-review checklist remains visible to researchers,
            // but it does not block remote self-enrollment. Consent/version checks, duplicate
            // protection, participant-ID validation, rate limits, and hashed access keys remain enforced.
            if (!remoteLiveStudyEnabled(config)) {
                if (!liveSwitch) fail('Live enrollment is not enabled on this deployment.', 409);
                if (config.deliveryMode !== 'remote') fail('Remote self-enrollment is not enabled for this study.', 409);
                fail('Remote self-enrollment is unavailable because deployment setup is incomplete.', 503);
            }
            if (req.body.consentAccepted !== true || req.body.consentVersion !== consentDocument.version)
                fail('Review and agree to the current consent form before creating study access.', 409);
            const signature = text(req.body.signature || '', 160, { trim: true });
            if (signature.length < 2) fail('Type your name on the consent page before creating study access.');
            const code = studentParticipantCode(req.body.participantId);
            await rate(req, `self-enroll-ip|${req.ip}`, RATE_LIMITS.selfEnrollIpPerHour, 3600);
            await rate(req, `self-enroll-code|${code}`, RATE_LIMITS.selfEnrollCodePerHour, 3600);
            if (config.preventDuplicateEntries) {
                if (hasValidEntryLock(req))
                    fail('This browser already started a research entry. Sign in with the same Participant ID and Private Access Key to resume instead.', 409);
                const existingToken = cookieToken(req);
                if (/^[A-Za-z0-9_-]{43}$/.test(existingToken)) {
                    const existingAuth = await db.call('token_get', { hash: sha256(existingToken) });
                    if (existingAuth) {
                        const existingAccount = await db.call('account', { pid: existingAuth.pid, studyKey: config.studyKey });
                        if ((existingAccount.sessions || []).some(x => x.entryLockedAt))
                            fail('This browser is already linked to a study entry that has started research questions. Sign in with that Participant ID and resume instead.', 409);
                    }
                }
            }
            const accessKey = generateAccessKey();
            const r = await db.call('enroll', { code, hash: await hashSecret(accessKey), isTest: false, language: '' });
            const token = crypto.randomBytes(32).toString('base64url');
            await db.call('token_issue', { pid: r.participantId, hash: sha256(token) });
            cookie(res, token);
            res.status(201).json({ ...r, accessKey, language: null, csrf: sha256(`csrf:${token}`), notice: 'Save your Participant ID and Private Access Key now. The key is shown only once.' });
        }
        catch (e) { next(e); }
    });
    app.post('/api/auth/login', async (req, res, next) => {
        try {
            const code = participantCode(req.body.participantId), secret = text(req.body.accessKey, 128, { trim: true });
            await rate(req, `login-ip|${req.ip}`, RATE_LIMITS.loginIpPer15Min);
            await rate(req, `login-code|${code}`, RATE_LIMITS.loginCodePer15Min);
            const a = await db.call('auth_lookup', { code });
            const dummy = 'scrypt$00000000000000000000000000000000$' + '0'.repeat(64);
            const valid = await verifySecret(secret, a?.secret_hash || dummy);
            if (!a || !valid)
                fail('Participant ID or access key is incorrect.', 401);
            const token = crypto.randomBytes(32).toString('base64url');
            await db.call('token_issue', { pid: a.participant_id, hash: sha256(token) });
            cookie(res, token);
            res.json({ code, csrf: sha256(`csrf:${token}`), isTest: a.is_test });
        }
        catch (e) {
            next(e);
        }
    });
    app.get('/api/admin/config', admin('research'), async (req, res, next) => {
        try {
            const current = await getConfig(); const liveSwitch = liveSwitchEnabled(); res.json({ ...current, contentHash: contentHashForConfig(current.config), liveCollectionEnabled: liveSwitch, remoteSelfEnrollmentOpen: remoteLiveStudyEnabled(current.config), releaseBlockers: releaseBlockers(current.config, liveSwitch), deploymentIssues: startupIssues });
        }
        catch (e) {
            next(e);
        }
    });
    app.put('/api/admin/config', admin('research'), async (req, res, next) => {
        try {
            const config = validateConfig(req.body.config);
            const saved = await db.call('config_save', { studyKey: defaultConfig.studyKey, config, revision: revision(req.body.revision) });
            invalidateConfigCache();
            res.json(saved);
        }
        catch (e) {
            next(e);
        }
    });
    app.post('/api/admin/participants', admin('research'), async (req, res, next) => {
        try {
            const isTest = req.body.isTest !== false;
            const { config } = await getConfig();
            const liveSwitch = env.LIVE_COLLECTION_ENABLED === 'true';
            if (!isTest && startupIssues.length)
                fail('Live enrollment is unavailable because deployment setup is incomplete. Check the Release Readiness panel.', 503);
            if (!isTest && (!canRunLive(config) || !liveSwitch))
                fail(`Live enrollment is not ready. ${releaseBlockers(config, liveSwitch).join(' ')}`, 409);
            const code = req.body.participantId ? participantCode(req.body.participantId) : 'CW-' + crypto.randomBytes(5).toString('hex').toUpperCase();
            const language = req.body.language || '';
            if (language && !config.languages.includes(language)) fail('Choose Python or Java.');
            const accessKey = generateAccessKey();
            const r = await db.call('enroll', { code, hash: await hashSecret(accessKey), isTest, language });
            res.status(201).json({ ...r, accessKey, isTest, notice: 'Save and deliver this access key privately. It will not be shown again.' });
        }
        catch (e) {
            next(e);
        }
    });
    app.post('/api/admin/participants/reset', admin('research'), async (req, res, next) => {
        try {
            const code = participantCode(req.body.participantId), accessKey = generateAccessKey();
            await db.call('credentials_reset', { code, hash: await hashSecret(accessKey) });
            res.json({ code, accessKey });
        }
        catch (e) {
            next(e);
        }
    });
    async function allRows(table) {
        let rows = [];
        for (let offset = 0;; offset += 1000) {
            const next = await db.call('admin_export', { table, offset, limit: 1000 });
            rows.push(...next);
            if (next.length < 1000)
                break;
            if (rows.length > 250000)
                fail('Export is too large; use a database export with the data steward.', 413);
        }
        return rows;
    }
    async function lineage() { const [sessions, assignments] = await Promise.all([allRows('sessions'), allRows('assignments')]); return { sessions, sessionMap: new Map(sessions.map(x => [x.id, x])), assignmentMap: new Map(assignments.map(x => [x.id, x])) }; }
    function enrich(rows, table, maps, includeTest) { return rows.map(r => { const sid = r.session_id || ((table === 'sessions') ? r.id : maps.assignmentMap.get(r.assignment_id)?.session_id); const s = maps.sessionMap.get(sid); return s ? { participant_code: s.participant_code, participant_id: s.participant_id, session_id: s.id, session_number: s.session_number, is_test: s.is_test, language: s.language, ...r } : r; }).filter(r => includeTest || r.is_test !== true); }
    const surveyExportNames = ['pre-survey', 'post-survey', 'pre-post-surveys'];
    const flattenResponse = (prefix, responses = {}) => Object.fromEntries(Object.entries(responses || {}).map(([k, v]) => [`${prefix}${k}`, Array.isArray(v) ? v.join(' | ') : v]));
    async function surveyRows(kind, includeTest) {
        const maps = await lineage(), stages = enrich(await allRows('stages'), 'stages', maps, includeTest);
        const wanted = kind === 'pre-survey' ? 'pre_survey' : kind === 'post-survey' ? 'post_survey' : null;
        if (wanted) return stages.filter(x => x.stage_key === wanted).map(x => ({ participant_code: x.participant_code, participant_id: x.participant_id, session_id: x.session_id, session_number: x.session_number, language: x.language, survey_type: wanted, status: x.status, instrument_version: x.instrument_version, completed_at: x.completed_at, ...flattenResponse('', x.responses) }));
        const bySession = new Map();
        for (const x of stages.filter(x => ['pre_survey', 'post_survey'].includes(x.stage_key))) {
            const row = bySession.get(x.session_id) || { participant_code: x.participant_code, participant_id: x.participant_id, session_id: x.session_id, session_number: x.session_number, language: x.language };
            const prefix = x.stage_key === 'pre_survey' ? 'pre_' : 'post_';
            Object.assign(row, flattenResponse(prefix, x.responses), { [`${prefix}status`]: x.status, [`${prefix}instrument_version`]: x.instrument_version, [`${prefix}completed_at`]: x.completed_at });
            bySession.set(x.session_id, row);
        }
        return [...bySession.values()];
    }
    app.get('/api/admin/export/:table.csv', admin('research'), async (req, res, next) => {
        try {
            const table = req.params.table, includeTest = req.query.includeTest === 'true';
            if (!EXPORT_TABLES.includes(table) && !surveyExportNames.includes(table))
                fail('Export not available.');
            const rows = surveyExportNames.includes(table) ? await surveyRows(table, includeTest) : enrich(await allRows(table), table, await lineage(), includeTest);
            res.attachment(`${table}-${new Date().toISOString().slice(0, 10)}.csv`).type('text/csv').send(toCSV(rows));
        }
        catch (e) {
            next(e);
        }
    });
    app.get('/api/admin/export.xlsx', admin('research'), async (req, res, next) => {
        try {
            const { default: ExcelJS } = await import('exceljs'), wb = new ExcelJS.Workbook(), maps = await lineage();
            for (const table of EXPORT_TABLES) {
                const rows = enrich(await allRows(table), table, maps, req.query.includeTest === 'true'), sheet = wb.addWorksheet(table), keys = [...new Set(rows.flatMap(Object.keys))];
                sheet.addRow(keys);
                for (const row of rows)
                    sheet.addRow(keys.map(k => spreadsheetCell(row[k])));
                sheet.views = [{ state: 'frozen', ySplit: 1 }];
            }
            for (const table of surveyExportNames) {
                const rows = await surveyRows(table, req.query.includeTest === 'true'), sheet = wb.addWorksheet(table.slice(0, 31)), keys = [...new Set(rows.flatMap(Object.keys))];
                sheet.addRow(keys);
                for (const row of rows) sheet.addRow(keys.map(k => spreadsheetCell(row[k])));
                sheet.views = [{ state: 'frozen', ySplit: 1 }];
            }
            const meta = wb.addWorksheet('README');
            meta.addRow(['Exported at', new Date().toISOString()]);
            meta.addRow(['Workflow', '4.0.0']);
            meta.addRow(['Privacy', 'No signature/contact/access-key tables included. Pseudonymous, not anonymous.']);
            meta.addRow(['Warning', 'Withdrawn/test/legacy rows must be handled according to the analysis plan.']);
            res.attachment('code-workout-research.xlsx');
            await wb.xlsx.write(res);
            res.end();
        }
        catch (e) {
            next(e);
        }
    });
    app.get('/api/admin/dashboard', admin('research'), async (req, res, next) => {
        try {
            const [allSessions, allStages, allOps, allCompletions, allAssignments] = await Promise.all(['sessions', 'stages', 'operations', 'modalities', 'assignments'].map(allRows));
            const sessions = allSessions.filter(s => (req.query.includeTest === 'true' || !s.is_test) && s.workflow_version), ids = new Set(sessions.map(s => s.id)), stages = allStages.filter(x => ids.has(x.session_id)), ops = allOps.filter(x => ids.has(x.session_id)), completions = allCompletions.filter(x => ids.has(x.session_id));
            const qtimes = allAssignments.filter(a => ids.has(a.session_id) && a.started_at && a.completed_at).map(a => (new Date(a.completed_at) - new Date(a.started_at)) / 1000);
            const mtimes = completions.map(c => c.duration_seconds);
            const avg = xs => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
            const participantMap = new Map();
            for (const s of sessions) {
                if (!participantMap.has(s.participant_code))
                    participantMap.set(s.participant_code, { participantCode: s.participant_code, sessions: {} });
                participantMap.get(s.participant_code).sessions[s.session_number] = { status: s.status, sessionId: s.id, startedAt: s.started_at, completedAt: s.completed_at, language: s.language, entryLockedAt: s.entry_locked_at, withdrawalRequestedAt: s.withdrawal_requested_at };
            }
            const testPairs = sessions.map(s => { const pre = stages.find(x => x.session_id === s.id && x.stage_key === 'pre_test'), post = stages.find(x => x.session_id === s.id && x.stage_key === 'post_test'); return { participantCode: s.participant_code, sessionId: s.id, number: s.session_number, language: s.language, pre: pre?.scoring ?? null, post: post?.scoring ?? null }; });
            res.json({ metrics: { averageElapsedSecondsPerQuestion: avg(qtimes), averageElapsedSecondsPerModality: avg(mtimes), participants: participantMap.size, sessions: sessions.length, completedSessions: sessions.filter(s => s.status === 'completed').length, completedModalities: completions.length, feedbackRequests: ops.filter(o => o.kind === 'feedback').length, feedbackSucceeded: ops.filter(o => o.kind === 'feedback' && o.status === 'succeeded').length, runRequests: ops.filter(o => o.kind === 'execute').length }, participants: [...participantMap.values()], testPairs, sessions, stages, languageUsage: sessions.reduce((o, s) => (o[s.language || 'not_selected'] = (o[s.language || 'not_selected'] || 0) + 1, o), {}) });
        }
        catch (e) {
            next(e);
        }
    });
    // Compensation data is available ONLY with the separate compensation operator key.
    app.get('/api/compensation-admin/claims', admin('payment'), async (req, res, next) => {
        try {
            const rows = await db.call('payment_list');
            res.json(rows.map(c => ({ ...c, contact: c.contact_envelope ? unseal(c.contact_envelope, encryptionKey, `claim:${c.id}`) : null, contact_envelope: undefined })));
        }
        catch (e) {
            next(e);
        }
    });
    app.post('/api/compensation-admin/paid', admin('payment'), async (req, res, next) => {
        try {
            res.json(await db.call('payment_paid', { claimId: uuid(req.body.claimId) }));
        }
        catch (e) {
            next(e);
        }
    });
    app.use('/api', auth);
    app.post('/api/auth/logout', async (req, res, next) => {
        try {
            await db.call('token_delete', { hash: sha256(req.auth.token) });
            res.clearCookie(cookieName, { path: '/', httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'strict' });
            res.json({ ok: true });
        }
        catch (e) {
            next(e);
        }
    });
    app.get('/api/account', async (req, res, next) => {
        try {
            const { config } = await getConfig();
            res.json({ code: req.auth.code, isTest: req.auth.isTest, csrf: req.auth.csrf, config: { sessions: config.sessions, contact: config.contact }, ...await db.call('account', { pid: req.auth.pid, studyKey: config.studyKey }) });
        }
        catch (e) {
            next(e);
        }
    });
    app.post('/api/sessions', async (req, res, next) => {
        try {
            const { config } = await getConfig();
            const number = req.body.sessionNumber;
            if (!Number.isInteger(number) || number < 1 || number > 3)
                fail('Choose Session 1, 2 or 3.');
            const account = await db.call('account', { pid: req.auth.pid, studyKey: config.studyKey });
            const existing = account.sessions.find(s => s.number === number);
            if (existing)
                return res.json(stateForClient(await rawState(req, existing.id)));
            if (config.preventDuplicateEntries !== false) {
                const lockedActive = account.sessions.find(s => s.status === 'active' && s.entryLockedAt);
                if (lockedActive)
                    fail(`Resume ${lockedActive.label || `Session ${lockedActive.number}`} before starting another study session.`, 409);
            }
            const wave = config.sessions.find(x => x.number === number);
            if (!wave.open)
                fail('This session is not open yet.', 409);
            if (!req.auth.isTest && !participantLiveStudyEnabled(config))
                fail('New live sessions are not enabled.', 503);
            const built = buildSnapshot(config, number, req.auth.pid);
            const s = await db.call('session_start', { pid: req.auth.pid, number, studyKey: config.studyKey, label: wave.label, version: config.workflowVersion, seed: crypto.randomBytes(32).toString('hex'), ...built });
            res.status(201).json(stateForClient(await rawState(req, s.id)));
        }
        catch (e) {
            next(e);
        }
    });
    app.get('/api/sessions/:sid', async (req, res, next) => {
        try {
            res.json(stateForClient(await rawState(req, req.params.sid)));
        }
        catch (e) {
            next(e);
        }
    });
    app.post('/api/sessions/:sid/withdraw', async (req, res, next) => {
        try {
            res.json(await db.call('withdraw', { ...params(req, req.params.sid), requestDataWithdrawal: req.body.requestDataWithdrawal === true }));
        }
        catch (e) {
            next(e);
        }
    });
    app.post('/api/sessions/:sid/operations/:id/displayed', async (req, res, next) => { try {
        res.json(await db.call('operation_displayed', { ...params(req, req.params.sid), id: uuid(req.params.id) }));
    }
    catch (e) {
        next(e);
    } });
    app.post('/api/sessions/:sid/heartbeat', async (req, res, next) => {
        try {
            if (!req.auth.isTest && (env.LIVE_COLLECTION_ENABLED !== 'true' || startupIssues.length))
                fail('Live collection is paused. Your saved data has not changed.', 503);
            const stage = req.body?.stage;
            if (!STAGES.includes(stage)) fail('Unknown study stage.');
            // cw_rpc re-checks ownership, the active session, and that this is still the
            // current stage. Avoiding a separate state round-trip materially reduces the
            // database load for a large in-person cohort.
            await db.call('heartbeat', { ...params(req, req.params.sid), stage });
            res.json({ ok: true });
        }
        catch (e) {
            next(e);
        }
    });
    app.post('/api/sessions/:sid/stages/:stage/open', async (req, res, next) => {
        try {
            const d = await rawState(req, req.params.sid);
            requireCurrent(d, req.params.stage);
            const st = await db.call('stage_open', { ...params(req, req.params.sid), stage: req.params.stage });
            res.json({ stage: publicDefinition(st.definition, d.session.language), responses: st.responses, revision: st.revision, firstViewedAt: st.first_viewed_at });
        }
        catch (e) {
            next(e);
        }
    });
    app.put('/api/sessions/:sid/stages/:stage', async (req, res, next) => {
        try {
            const d = await rawState(req, req.params.sid), key = req.params.stage, st = getStage(d, key), def = privateDefinition(st, d.session.language), body = object(req.body), final = body.final === true, skip = body.skipped === true;
            // DB repeats current-stage, ownership and revision checks atomically.
            const p = { ...params(req, req.params.sid), stage: key, revision: revision(body.revision), requestId: uuid(body.requestId), final, skipped: skip, responses: {} };
            if (skip && !['pre_survey', 'pre_test', 'coding', 'post_test', 'post_survey'].includes(key))
                fail('This stage cannot be skipped. You may stop participating.');
            if (['pre_survey', 'post_survey', 'pre_test', 'post_test'].includes(key)) {
                p.responses = validateAnswers(def, body.responses || {});
                p.scoring = key.endsWith('test') ? scoreAssessment(def, p.responses) : scoreSelfEfficacy(def, p.responses);
            }
            else if (key === 'information') {
                p.responses = { acknowledged: final };
            }
            else if (key === 'demo') {
                p.responses = { acknowledged: final };
            }
            else if (key === 'eligibility') {
                if (final && typeof body.responses?.enrolled !== 'boolean')
                    fail('Answer the enrollment question.');
                if (final && typeof body.responses?.adult !== 'boolean')
                    fail('Answer the age question.');
                p.responses = { eligible: body.responses?.enrolled === true && body.responses?.adult === true };
            }
            else if (key === 'consent') {
                if (!final)
                    fail('The signature is recorded only when you consent.');
                if (body.responses?.consented !== true)
                    fail('Consent is required before study activities.');
                const signature = text(body.signature, 160, { trim: true });
                if (signature.length < 2)
                    fail('Type your name to sign after reviewing the consent information.');
                p.responses = { consented: true, documentVersion: def.document.version, documentHash: def.documentHash };
                p.documentVersion = def.document.version;
                p.documentHash = def.documentHash;
                p.document = def.document;
                p.signature = seal({ typedName: signature, method: 'typed-name-with-explicit-agreement' }, encryptionKey, `consent:${req.params.sid}`);
            }
            else if (key === 'language') {
                const language = body.responses?.language;
                if (!d.session.protocol_snapshot.config.languages.includes(language))
                    fail('Choose an available language.');
                p.responses = { language };
            }
            else if (key === 'coding') {
                if (!final)
                    fail('Coding has its own draft saving.');
                p.responses = { acknowledged: true, skipped: skip };
            }
            else if (key === 'incentive') {
                if (!final)
                    fail('Compensation contacts are not stored as drafts.');
                const choice = body.choice;
                if (!['receive', 'later', 'decline'].includes(choice))
                    fail('Choose a compensation option.');
                p.claimId = crypto.randomUUID();
                p.claimStatus = { receive: 'requested', later: 'contact_pending', decline: 'declined' }[choice];
                p.contact = choice === 'receive' ? seal({ email: email(body.email) }, encryptionKey, `claim:${p.claimId}`) : null;
                p.responses = { choice, contactProvided: choice === 'receive' };
            }
            else
                fail('This stage is not editable.');
            const saved = await db.call('stage_save', p);
            res.json({ saved: true, revision: saved.revision, savedAt: saved.saved_at, state: final ? stateForClient(await rawState(req, req.params.sid)) : undefined });
        }
        catch (e) {
            next(e);
        }
    });
    app.get('/api/sessions/:sid/consent-copy', async (req, res, next) => {
        try {
            const c = await db.call('consent_receipt', params(req, req.params.sid));
            if (!c)
                fail('No signed consent is available.', 404);
            const signed = unseal(c.signature_envelope, encryptionKey, `consent:${req.params.sid}`);
            res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Consent copy</title><link rel="stylesheet" href="/styles.css"><main class="app-shell card"><h1>${html(c.document_snapshot.title)}</h1><p>USU IRB Protocol #${html(c.document_snapshot.protocol)}</p>${c.document_snapshot.sections.map(s => `<h2>${html(s.heading)}</h2>${s.paragraphs.map(p => `<p>${html(p)}</p>`).join('')}`).join('')}<h2>Your consent record</h2><p>Typed signature: ${html(signed.typedName)}</p><p>Recorded: ${html(c.signed_at)} (UTC)</p><p>Use your browser's Print function to save a copy.</p></main></html>`);
        }
        catch (e) {
            next(e);
        }
    });
    app.get('/api/sessions/:sid/claim', async (req, res, next) => {
        try {
            res.json(await db.call('claim_get', params(req, req.params.sid)));
        }
        catch (e) {
            next(e);
        }
    });
    app.put('/api/sessions/:sid/claim', async (req, res, next) => {
        try {
            const p = params(req, req.params.sid), claim = await db.call('claim_get', p);
            if (!claim)
                fail('No compensation claim was found.', 404);
            res.json(await db.call('claim_update', { ...p, envelope: seal({ email: email(req.body.email) }, encryptionKey, `claim:${claim.id}`) }));
        }
        catch (e) {
            next(e);
        }
    });
    async function codingContext(req) { const sid = uuid(req.body.sessionId), d = await rawState(req, sid); requireCurrent(d, 'coding'); const a = await db.call('assignment_get', { ...params(req, sid), assignmentId: uuid(req.body.assignmentId) }); return { d, a, sid, question: a.question_snapshot }; }
    app.post('/api/modality/start', async (req, res, next) => {
        try {
            const sid = uuid(req.body.sessionId), modality = req.body.modalityId;
            if (!MODALITIES.includes(modality))
                fail('Unknown modality.');
            const d = await rawState(req, sid);
            requireCurrent(d, 'coding');
            const s = d.session;
            const existing = await db.call('coding_start', { ...params(req, sid), modality, lookupOnly: true });
            if (existing) {
                if (existing.assignment)
                    existing.operations = existing.operations.map(clientOperation);
                return res.json(publicCodingPayload(existing));
            }
            const pinnedBankHash = s.protocol_snapshot.questionBankHash || null;
            const [bank, used] = await Promise.all([pinnedBankHash ? db.call('bank_release', { language: s.language, bankHash: pinnedBankHash }) : db.call('bank', { language: s.language }), db.call('used_questions', { pid: req.auth.pid, sid, studyKey: s.study_key })]);
            if (pinnedBankHash && (!Array.isArray(bank) || bank.length === 0)) fail("This session's question-bank release is unavailable. Ask the research team to verify the database migration before continuing.", 503);
            const count = assignmentCount(s.protocol_snapshot, modality);
            const candidates = bankCandidates(bank, s.protocol_snapshot, s.session_number, modality, used);
            const ids = deterministicPick(candidates.map(q => q.id), s.randomization_seed, `${s.session_number}|${modality}`, count);
            const questions = ids.map(id => { const q = bank.find(x => x.id === id); return { ...q, inputSchema: q.inputSchema || inputSchemas.questions[id] || [], bankVersion: pinnedBankHash || s.protocol_snapshot.config.questionBankVersion || 'legacy-current-bank', questionVersion: hashObject(q).slice(0, 16) }; });
            const r = await db.call('coding_start', { ...params(req, sid), modality, questions, questionIds: ids });
            if (r.assignment)
                r.operations = r.operations.map(clientOperation);
            res.json(publicCodingPayload(r));
        }
        catch (e) {
            next(e);
        }
    });
    app.put('/api/draft', async (req, res, next) => {
        try {
            const { d, a, sid, question } = await codingContext(req);
            const b = req.body, final = b.final === true, skipped = b.skipped === true;
            const code = a.modality_id === 'code-explanation' ? question.starter_code : text(b.code ?? '', 30000);
            const explanation = a.modality_id === 'code-explanation' ? text(b.explanation ?? '', 12000) : '';
            const inputs = a.modality_id === 'code-explanation' ? {} : serializeInputs(question.inputSchema || [], b.inputs || {}, { required: false }).values;
            if (final && !skipped && !(a.modality_id === 'code-explanation' ? explanation.trim() : code.trim()))
                fail('Enter a response or use Skip question.');
            let score = null;
            if (final && !skipped && a.last_score) {
                const op = a.last_score, payload = op.payload || {};
                const codeMatches = payload.code === code, explanationMatches = (payload.explanation || '') === explanation, inputMatches = hashObject(payload.inputValues || {}) === hashObject(inputs);
                if (codeMatches && explanationMatches && inputMatches) score = op.kind === 'execute' ? op.result?.score : op.result;
            }
            const s = await db.call('assignment_save', { ...params(req, sid), assignmentId: a.id, code, explanation, inputs, score, revision: revision(b.revision), requestId: uuid(b.requestId), final, skipped });
            if (final && !skipped && d.session.is_test !== true && d.session.protocol_snapshot.config.preventDuplicateEntries !== false)
                setEntryLock(res);
            res.json({ saved: true, revision: s.revision, savedAt: s.updated_at });
        }
        catch (e) {
            next(e);
        }
    });
    app.post('/api/modality/complete', async (req, res, next) => {
        try {
            const sid = uuid(req.body.sessionId);
            if (!MODALITIES.includes(req.body.modalityId))
                fail('Unknown modality.');
            await db.call('modality_complete', { ...params(req, sid), modality: req.body.modalityId });
            res.json(stateForClient(await rawState(req, sid)));
        }
        catch (e) {
            next(e);
        }
    });
    for (const kind of ['execute', 'feedback', 'score'])
        app.post(`/api/${kind}`, async (req, res, next) => {
            let op, context;
            try {
                context = await codingContext(req);
                const { d, a, sid, question } = context, cfg = d.session.protocol_snapshot.config;
                if (kind === 'execute' && a.modality_id === 'code-explanation')
                    fail('Run Code is not available for Code Explanation activities.', 403);
                if (kind === 'execute' && !cfg.executionEnabled)
                    fail('Code execution is disabled in this study.', 403);
                if (kind === 'feedback' && (!cfg.aiEnabled || !cfg.aiModalities.includes(a.modality_id)))
                    fail('AI feedback is not enabled for this activity.', 403);
                if (kind === 'score' && a.modality_id !== 'code-explanation')
                    fail('Use Run Code to score Problem Solving and Debugging activities.', 403);
                const code = a.modality_id === 'code-explanation' ? question.starter_code : text(req.body.code ?? '', 30000);
                const explanation = a.modality_id === 'code-explanation' ? text(req.body.explanation ?? '', 12000) : '';
                const input = a.modality_id === 'code-explanation' ? { values: {}, stdin: '' } : serializeInputs(question.inputSchema || [], req.body.inputs || {}, { required: kind === 'execute' });
                const feedbackType = kind === 'feedback' ? req.body.feedbackType : null;
                if (kind === 'feedback' && !cfg.feedbackTypes.includes(feedbackType))
                    fail('Choose an available feedback type.');
                if (kind === 'execute' && !code.trim())
                    fail('Enter code to run.');
                if (kind === 'feedback' && !(a.modality_id === 'code-explanation' ? explanation.trim() : code.trim()))
                    fail('Enter a response before requesting feedback.');
                if (kind === 'score' && !explanation.trim())
                    fail('Enter your explanation before checking it.');
                const payload = { code, explanation, inputValues: input.values, stdin: input.stdin, language: d.session.language, modality: a.modality_id, feedbackType, questionId: a.question_id, questionVersion: question.questionVersion || question.bankVersion };
                op = await db.call('operation_begin', { ...params(req, sid), assignmentId: a.id, kind, id: crypto.randomUUID(), requestId: uuid(req.body.requestId), limit: kind === 'execute' ? cfg.maxRunsPerQuestion : cfg.maxFeedbackPerQuestion, payload });
                if (op.existing) {
                    if (op.status === 'pending')
                        fail('This request is still running. Retry shortly with the same request identifier.', 409);
                    return res.json(clientOperation(op));
                }
                let result;
                if (kind === 'execute') {
                    result = await providers.execute(d.session.language, code, input.stdin);
                    try {
                        let expectedConcepts = question.expected_concepts;
                        if (!Array.isArray(expectedConcepts)) {
                            const bank = await db.call('bank', { language: d.session.language });
                            expectedConcepts = bank.find(q => q.id === a.question_id)?.expected_concepts || [];
                        }
                        result.score = await providers.grade({ language: d.session.language, modality: a.modality_id, question, code, explanation: '', execution: result, expectedConcepts });
                    }
                    catch (gradeError) {
                        result.score = { score: null, summary: gradeError instanceof AppError ? gradeError.message : 'Scoring is temporarily unavailable. Your program output is still valid.', checks: [], unavailable: true };
                    }
                }
                else if (kind === 'score') {
                    let expectedConcepts = question.expected_concepts;
                    if (!Array.isArray(expectedConcepts)) {
                        const bank = await db.call('bank', { language: d.session.language });
                        expectedConcepts = bank.find(q => q.id === a.question_id)?.expected_concepts || [];
                    }
                    result = await providers.grade({ language: d.session.language, modality: a.modality_id, question, code, explanation, execution: null, expectedConcepts });
                }
                else
                    result = await providers.feedback({ language: d.session.language, modality: a.modality_id, feedbackType, question, code, explanation, output: a.last_execution?.payload?.code === code && hashObject(a.last_execution.payload.inputValues || {}) === hashObject(input.values) ? JSON.stringify({ status: a.last_execution.result.status, stdout: a.last_execution.result.stdout, stderr: a.last_execution.result.stderr, compileOutput: a.last_execution.result.compileOutput }) : null });
                const saved = await db.call('operation_finish', { ...params(req, sid), assignmentId: a.id, id: op.id, status: 'succeeded', result });
                res.json(clientOperation(saved));
            }
            catch (e) {
                if (op && !op.existing && context) {
                    try {
                        await db.call('operation_finish', { ...params(req, context.sid), assignmentId: context.a.id, id: op.id, status: 'failed', result: { error: e instanceof AppError ? e.message : 'Provider request failed.', type: 'service_error' } });
                    }
                    catch { console.error(JSON.stringify({ event: 'operation_log_finalize_failed', operationId: op.id })); }
                }
                next(e);
            }
        });
    // Explicitly close old unauthenticated endpoints rather than retaining an ID-only login.
    app.all('/api/session/start', (req, res) => res.status(410).json({ error: 'Use the Participant ID and private access-key sign-in.' }));
    app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown endpoint.' }));
    app.use('/vendor/monaco', express.static(path.join(ROOT, 'node_modules/monaco-editor/min'), { maxAge: '7d', immutable: true }));
    app.use(express.static(path.join(ROOT, 'public'), { etag: true, maxAge: 0 }));
    app.use((err, req, res, next) => {
        if (res.headersSent)
            return next(err);
        const status = err instanceof AppError ? err.status : err.type === 'entity.too.large' ? 413 : err instanceof SyntaxError ? 400 : 500;
        if (status === 500)
            console.error(JSON.stringify({ event: 'request_failed', path: req.path, requestId: crypto.randomUUID() }));
        res.status(status).json({ error: status === 500 ? 'The request could not be completed. Your saved data remains available.' : err.message });
    });
    return app;
}
