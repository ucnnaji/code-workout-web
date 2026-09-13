import { SaveQueue } from './autosave.mjs';
const $ = id => document.getElementById(id);
const operationRetries = new Map();
const finalRetries = new Map();
const state = { publicInfo: null, preflight: null, account: null, flow: null, csrf: '', stage: null, queue: null, assignment: null, submission: null, modality: null, editor: null, monacoReady: false, loadingAssignment: false, lastExecutionText: '', lastScore: null, busy: false, autosaveTimer: null, activeInputAt: Date.now() };
const labels = { information: 'Information', consent: 'Consent', pre_survey: 'Pre-survey', demo: 'Demo', language: 'Language', coding: 'Practice', post_survey: 'Post-survey', incentive: 'Incentive', completion: 'Complete' };
const screens = ['loadingScreen', 'consentScreen', 'declineScreen', 'accessSetupScreen', 'participantScreen', 'sessionScreen', 'workflowScreen', 'modalityScreen', 'workspaceScreen', 'reviewScreen', 'completionScreen'];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => crypto.randomUUID();
function toast(message) { $('toast').textContent = message; $('toast').classList.remove('hidden'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').classList.add('hidden'), 6500); }
function showScreen(id) {
    for (const key of screens)
        $(key).classList.toggle('hidden', id !== key);
    window.scrollTo({ top: 0, behavior: 'auto' });
    $(id).querySelector('h2')?.focus({ preventScroll: true });
}
function renderPreflightConsent() {
    const doc = state.publicInfo.consent;
    $('preflightConsentCopy').innerHTML = `<p class="muted">USU IRB Protocol #${esc(doc.protocol)}</p>${doc.sections.map(s => `<h3>${esc(s.heading)}</h3>${s.paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}`).join('')}`;
    $('preflightAgree').checked = false;
    $('preflightSignature').value = '';
    $('preflightConsentError').textContent = '';
    showScreen('consentScreen');
}
async function applyStoredPreflight(flow) {
    const pf = state.preflight;
    if (!pf?.consented) return flow;
    let f = flow;
    for (let guard = 0; guard < 3; guard++) {
        if (f.currentStage === 'information') {
            const opened = await api(`/api/sessions/${f.session.id}/stages/information/open`, { method: 'POST', body: {} });
            const saved = await api(`/api/sessions/${f.session.id}/stages/information`, { method: 'PUT', body: { revision: opened.revision, requestId: uid(), final: true, responses: {} } });
            f = saved.state; continue;
        }
        if (f.currentStage === 'consent') {
            const opened = await api(`/api/sessions/${f.session.id}/stages/consent/open`, { method: 'POST', body: {} });
            const saved = await api(`/api/sessions/${f.session.id}/stages/consent`, { method: 'PUT', body: { revision: opened.revision, requestId: uid(), final: true, responses: { consented: true }, signature: pf.signature } });
            f = saved.state;
            sessionStorage.removeItem('cw4-preflight');
            state.preflight = null;
            continue;
        }
        break;
    }
    return f;
}
async function api(path, { method = 'GET', body, ...options } = {}) {
    let response;
    try {
        response = await fetch(path, { method, ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
    }
    catch {
        const e = new Error('Connection lost. Keep this tab open; your unsaved work is retained here.');
        e.status = 0;
        throw e;
    }
    let d;
    try {
        d = await response.json();
    }
    catch {
        d = { error: 'Unexpected server response.' };
    }
    if (!response.ok) {
        const e = new Error(d.error || 'Request failed.');
        e.status = response.status;
        throw e;
    }
    return d;
}
async function confirmAction(title, message) { const d = $('confirmDialog'); $('dialogTitle').textContent = title; $('dialogMessage').textContent = message; d.returnValue = 'cancel'; d.showModal(); return new Promise(resolve => d.addEventListener('close', () => resolve(d.returnValue === 'confirm'), { once: true })); }
function sessionURL(suffix = '') { return `/api/sessions/${state.flow.session.id}${suffix}`; }
function storageKey() { return `cw3:${state.account?.code}:${state.flow?.session.id}:${state.assignment?.id || state.stage?.key}`; }
function cacheDraft() {
    if (state.queue?.dirty)
        try {
            sessionStorage.setItem(storageKey(), JSON.stringify({ revision: state.queue.revision, value: state.queue.value }));
        }
        catch {
            toast('This browser could not retain a local recovery copy. Keep the tab open until Saved appears.');
        }
}
function clearCache() {
    try {
        sessionStorage.removeItem(storageKey());
    }
    catch { }
}
function saveStatus(status, error) {
    const el = state.assignment ? $('autosaveStatus') : $('stageSaveStatus');
    el.textContent = { dirty: 'Unsaved changes', saving: 'Saving…', saved: 'Saved', error: 'Not saved — retrying while this tab is open', conflict: 'Newer draft exists in another tab. Copy your changes before reloading.' }[status];
    el.className = `autosave ${status === 'error' || status === 'conflict' ? 'error' : status === 'saving' ? 'saving' : ''}`;
    if (error?.status === 401)
        el.textContent = 'Sign-in expired. Copy your unsaved work, then sign in again.';
}
function installQueue(revision, save) {
    state.queue = new SaveQueue({ revision, save, onStatus: saveStatus, onAck: () => {
            if (!state.queue.dirty)
                clearCache();
            else
                cacheDraft();
        } });
    saveStatus('saved');
}
function scheduleSave(value) {
    if (!state.queue)
        return;
    state.queue.set(value);
    cacheDraft();
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(() => state.queue.flush().catch(() => { }), 600);
}
async function flush() { clearTimeout(state.autosaveTimer); await state.queue?.flush(); }
async function recoverDraft(apply) {
    let cached;
    try {
        cached = JSON.parse(sessionStorage.getItem(storageKey()) || 'null');
    }
    catch { }
    if (!cached)
        return;
    if (cached.revision !== state.queue.revision) {
        toast('This tab has an older unsynced draft. It was not applied over the newer server response. Copy it from the recovery download before reloading.');
        const b = document.createElement('button');
        b.className = 'ghost';
        b.textContent = 'Download unsynced recovery draft';
        b.onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(cached, null, 2)], { type: 'application/json' })); a.download = 'unsynced-study-draft.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
        (state.assignment ? $('structuredInputs') : $('stageContent')).appendChild(b);
        return;
    }
    if (await confirmAction('Restore unsaved work?', 'This tab has changes that were not acknowledged by the server. Restore them and try saving again?')) {
        apply(cached.value);
        scheduleSave(cached.value);
    }
}
function renderTracker() {
    const f = state.flow;
    if (!f)
        return;
    const active = f.currentStage;
    $('stageTracker').classList.remove('hidden');
    $('stageTracker').innerHTML = `<ol>${f.stages.filter(s => s.status !== 'disabled').map(s => `<li class="${s.key === active ? 'current' : ['completed', 'skipped'].includes(s.status) ? 'done' : ''}" ${s.key === active ? 'aria-current="step"' : ''}>${s.status === 'completed' ? '✓ ' : s.status === 'skipped' ? '↷ ' : ''}${esc(labels[s.key])}${s.status === 'skipped' ? ' (skipped)' : ''}</li>`).join('')}</ol>`;
}
async function applyFlow(f) {
    if (state.preflight && ['information', 'consent'].includes(f.currentStage)) f = await applyStoredPreflight(f);
    state.flow = f;
    state.assignment = null;
    state.submission = null;
    state.queue = null;
    state.stage = null;
    $('sessionMeta').classList.remove('hidden');
    $('sessionMeta').textContent = `Participant ${state.account.code} · Session ${f.session.number}${f.session.language ? ' · ' + f.session.language : ''}`;
    $('studyControls').classList.remove('hidden');
    $('stopStudy').classList.toggle('hidden', f.session.status !== 'active');
    $('reviewNotice').classList.toggle('hidden', !f.session.isTest);
    $('reviewNotice').textContent = 'TEST SESSION — Use synthetic information only. This workflow is not released for research collection.';
    $('consentCopy').classList.toggle('hidden', !f.session.consentedAt);
    $('consentCopy').href = sessionURL('/consent-copy');
    renderTracker();
    if (f.session.status !== 'active')
        return showCompletion();
    if (f.currentStage === 'coding') {
        await api(sessionURL('/stages/coding/open'), { method: 'POST', body: {} });
        return renderModalities();
    }
    return renderStage();
}
async function startSession(number) {
    try {
        await flush();
        const f = await api('/api/sessions', { method: 'POST', body: { sessionNumber: number } });
        await applyFlow(f);
    }
    catch (e) {
        toast(e.message);
    }
}
async function loadAccount(auto = false) {
    state.account = await api('/api/account');
    state.csrf = state.account.csrf;
    $('studyControls').classList.remove('hidden');
    $('stopStudy').classList.add('hidden');
    if (auto) {
        const active = state.account.sessions.filter(s => s.status === 'active');
        if (active.length === 1)
            return applyFlow(await api(`/api/sessions/${active[0].id}`));
        const available = state.account.config.sessions.filter(s => s.open && !state.account.sessions.some(t => t.number === s.number));
        if (!active.length && available.length === 1)
            return startSession(available[0].number);
    }
    renderSessions();
}
function renderSessions() {
    state.flow = null;
    state.queue = null;
    $('stageTracker').classList.add('hidden');
    $('consentCopy').classList.add('hidden');
    const list = $('sessionList');
    list.replaceChildren();
    for (const wave of state.account.config.sessions) {
        const found = state.account.sessions.find(s => s.number === wave.number);
        const row = document.createElement('div');
        row.className = 'session-option';
        row.innerHTML = `<div><strong>${esc(wave.label)}</strong><p class="muted small-text">${found ? esc(found.status) : wave.open ? 'Available' : 'Not yet open'}</p></div>`;
        const b = document.createElement('button');
        b.className = 'primary';
        b.textContent = found?.status === 'active' ? 'Resume' : found ? 'View confirmation' : 'Begin';
        b.disabled = !found && !wave.open;
        b.onclick = () => startSession(wave.number);
        row.appendChild(b);
        list.appendChild(row);
    }
    showScreen('sessionScreen');
}
function collectAnswers() {
    const answers = {};
    for (const item of state.stage.items || []) {
        if (item.type === 'text')
            answers[item.id] = $(`q_${item.id}`).value || null;
        else if (item.type === 'multi')
            answers[item.id] = [...document.querySelectorAll(`input[name="${item.id}"]:checked`)].map(el => el.value);
        else
            answers[item.id] = document.querySelector(`input[name="${item.id}"]:checked`)?.value || null;
    }
    return answers;
}
function populateAnswers(values) {
    for (const item of state.stage.items || []) {
        const v = values[item.id];
        if (item.type === 'text')
            $(`q_${item.id}`).value = v || '';
        else
            document.querySelectorAll(`input[name="${item.id}"]`).forEach(el => el.checked = Array.isArray(v) ? v.includes(el.value) : (v ?? '') === el.value);
    }
}
function questionHTML(item) {
    let controls;
    if (item.type === 'text')
        controls = `<textarea id="q_${esc(item.id)}" rows="3" maxlength="3000" aria-labelledby="label_${esc(item.id)}"></textarea>`;
    else
        controls = (item.options || []).map((o, i) => `<label class="option-label"><input type="${item.type === 'multi' ? 'checkbox' : 'radio'}" name="${esc(item.id)}" value="${esc(o)}"><span>${item.type === 'likert' ? `${i + 1} — ` : ''}${esc(o)}</span></label>`).join('') + (item.type !== 'multi' ? `<label class="option-label"><input type="radio" name="${esc(item.id)}" value=""><span>Prefer not to answer</span></label>` : '');
    return `<fieldset class="survey-item"><legend id="label_${esc(item.id)}">${esc(item.label)} <span class="muted small-text">(optional)</span></legend>${item.code ? `<pre class="assessment-code">${esc(item.code)}</pre>` : ''}${controls}</fieldset>`;
}
async function renderStage() {
    const key = state.flow.currentStage;
    const data = await api(sessionURL(`/stages/${key}/open`), { method: 'POST', body: {} });
    state.stage = data.stage;
    state.queue = null;
    const cfg = state.flow.config;
    const root = $('stageContent');
    $('stageTitle').textContent = data.stage.label;
    $('stageEyebrow').textContent = `Session ${state.flow.session.number}`;
    $('stageError').textContent = '';
    $('stageSaveStatus').textContent = '';
    let body = '';
    if (key === 'information') {
        const tiles = [['◎', 'Purpose', 'Understand how programming practice affects students’ programming confidence and skills.'], ['▤', 'What you will do', 'Review consent, answer surveys, and complete the assigned Problem Solving, Debugging and Code Explanation activities.'], ['◷', 'Time', cfg.durationText], ['✓', 'Your choice', 'Participation is voluntary. You may skip research questions or stop. Your decision does not affect your grade or academic standing.'], ['▣', 'Privacy', 'Use your study ID, not your name, in research responses. Consent signatures and compensation contacts are stored separately. The research team can still link records when necessary.'], ['✉', 'Questions', `${cfg.contact.name} · ${cfg.contact.email} · ${cfg.contact.phone}`]];
        body = `<p>Take a moment to learn about the study before deciding whether to take part.</p><div class="info-graphic">${tiles.map(([icon, title, content]) => `<section class="info-tile"><h3><span class="info-icon" aria-hidden="true">${icon}</span>${esc(title)}</h3><p>${esc(content)}</p></section>`).join('')}</div><button id="stageContinue" class="primary">Continue</button>`;
    }
    else if (key === 'eligibility') {
        body = `<p>These questions confirm eligibility before you view the consent form. Do not provide your name, email, or student number.</p>${[['enrolled', 'Are you currently enrolled in an introductory programming course at Utah State University?'], ['adult', 'Are you 18 years of age or older?']].map(([id, label]) => `<fieldset class="survey-item"><legend>${esc(label)}</legend>${['Yes', 'No'].map(v => `<label class="option-label"><input name="${id}" type="radio" value="${v}"><span>${v}</span></label>`).join('')}</fieldset>`).join('')}<div class="stage-actions"><button id="stageContinue" class="primary">Continue</button></div>`;
    }
    else if (key === 'consent') {
        const doc = data.stage.document;
        body = `<p class="muted">USU IRB Protocol #${esc(doc.protocol)}</p><div class="consent-text">${doc.sections.map(s => `<h3>${esc(s.heading)}</h3>${s.paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}`).join('')}</div><p class="private-note">Your signature is a separate identifying record. It is not included in research-response exports. Use the consent-copy link after signing to print or save your copy.</p><label class="option-label"><input id="agreeConsent" type="checkbox"><span>I have read this information, have had the opportunity to ask questions, and agree to participate.</span></label><label for="typedSignature">Type your name to sign</label><input id="typedSignature" maxlength="160" autocomplete="name"><div class="stage-actions"><button id="stageContinue" class="primary">Agree &amp; continue</button><button id="declineConsent" class="ghost">I do not consent</button></div>`;
    }
    else if (key === 'demo') {
        body = `<p class="muted">This short visual tour labels the parts of the practice workspace you will use next.</p>
        <div class="demo-workspace" role="img" aria-label="Labeled example of the Code Workout practice environment">
          <aside class="demo-question"><span class="demo-callout">1 · Question</span><h3>Practice question</h3><p>Read the programming task here.</p></aside>
          <section class="demo-editor"><span class="demo-callout">2 · Code Editor</span><pre>1  Your code appears here
2  ...</pre></section>
          <div class="demo-actions"><span class="demo-callout">3 · Run Code</span><button class="primary" type="button" disabled>▶ Run Code</button><button class="ai-button" type="button" disabled>✦ AI Feedback</button></div>
          <section class="demo-output"><span class="demo-callout">4 · Program Output</span><pre>Program output appears here.</pre></section>
          <section class="demo-feedback"><span class="demo-callout">5 · AI Feedback</span><p>Instructional feedback appears separately from actual program output.</p></section>
          <div class="demo-save"><span class="demo-callout">6 · Save Response</span><button class="save-button" type="button" disabled>Save Final Response</button></div>
        </div><div class="stage-actions"><button id="stageContinue" class="primary">Continue to practice activities</button></div>`;
    }
    else if (key === 'language') {
        body = `<p class="muted">Choose the programming language you use in your course. You will select it once, and it will be used for your surveys and coding activities in all study sessions.</p><div class="choice-grid two-col language-choice-grid">${cfg.languages.map(l => `<button class="language-choice language-choice-card" data-language="${l}" aria-label="Choose ${l === 'python' ? 'Python' : 'Java'}"><span class="language-choice-icon" aria-hidden="true"><i class="${l === 'python' ? 'devicon-python-plain colored' : 'devicon-java-plain colored'}"></i></span><span class="language-choice-copy"><strong>${l === 'python' ? 'Python' : 'Java'}</strong><span>${state.flow.session.language && state.flow.session.language !== l ? 'Not your selected study language' : 'Use ' + (l === 'python' ? 'Python' : 'Java') + ' throughout this study'}</span></span></button>`).join('')}</div>`;
    }
    else if (key === 'incentive') {
        body = `<p>${esc(cfg.compensation.description)}</p><p>${esc(cfg.compensation.instructions)}</p><p class="muted">${esc(cfg.compensation.courseCredit)}</p><p class="private-note">Your gift-card email is stored in a separate, encrypted compensation record. Do not include payment details in survey or code responses.</p>${[['receive', 'Provide my email for this session’s gift card'], ['later', 'I will provide my email to the study team later'], ['decline', 'I do not want a gift card']].map(([v, t]) => `<label class="option-label"><input type="radio" name="compensationChoice" value="${v}"><span>${esc(t)}</span></label>`).join('')}<div id="emailField" class="hidden"><label for="compensationEmail">Email for your e-gift card</label><input id="compensationEmail" type="email" maxlength="254" autocomplete="email"></div><div class="stage-actions"><button id="stageContinue" class="save-button">Save &amp; finish session</button></div>`;
    }
    else {
        body = `<p>${key.endsWith('test') ? 'Answer the assessment questions independently. AI feedback and code execution are not available during assessments.' : esc(data.stage.prompt || 'Please answer the following questions.')}</p>${data.stage.scaleNote ? `<p class="muted">${esc(data.stage.scaleNote)}</p>` : ''}<p class="muted">You may leave any item unanswered. Unanswered items are recorded as missing, not silently treated as incorrect.</p><form id="surveyForm">${(data.stage.items || []).map(questionHTML).join('')}<div class="stage-actions"><button class="primary" type="submit">Save &amp; continue</button><button id="skipStage" class="ghost" type="button">Skip this section</button></div></form>`;
    }
    root.innerHTML = body;
    showScreen('workflowScreen');
    const finalId = uid();
    let submitted = null;
    const send = async (extra = {}) => {
        if (state.busy)
            return;
        state.busy = true;
        root.querySelectorAll('button,input,textarea,select').forEach(b => b.disabled = true);
        try {
            await flush();
            submitted ||= { revision: state.queue?.revision ?? data.revision, requestId: finalId, final: true, ...extra };
            const r = await api(sessionURL(`/stages/${key}`), { method: 'PUT', body: submitted });
            submitted = null;
            clearCache();
            await applyFlow(r.state);
        }
        catch (e) {
            if (e.status && e.status < 500)
                submitted = null;
            $('stageError').textContent = e.message + (submitted ? ' Retry Continue to confirm this same submission, or refresh to check saved progress.' : '');
        }
        finally {
            state.busy = false;
            root.querySelectorAll('button,input,textarea,select').forEach(b => b.disabled = false);
            if (submitted)
                root.querySelectorAll('input,textarea,select').forEach(b => b.disabled = true);
            if (state.flow?.session.language)
                root.querySelectorAll('[data-language]').forEach(b => b.disabled = b.dataset.language !== state.flow.session.language);
        }
    };
    if (key === 'information')
        $('stageContinue').onclick = () => send();
    else if (key === 'demo')
        $('stageContinue').onclick = () => send();
    else if (key === 'eligibility')
        $('stageContinue').onclick = () => {
            const enrolled = document.querySelector('input[name="enrolled"]:checked')?.value, adult = document.querySelector('input[name="adult"]:checked')?.value;
            if (!enrolled || !adult)
                return $('stageError').textContent = 'Please answer both eligibility questions.';
            send({ responses: { enrolled: enrolled === 'Yes', adult: adult === 'Yes' } });
        };
    else if (key === 'consent') {
        $('stageContinue').onclick = () => {
            if (!$('agreeConsent').checked)
                return $('stageError').textContent = 'You must consent before beginning study activities.';
            send({ responses: { consented: true }, signature: $('typedSignature').value });
        };
        $('declineConsent').onclick = () => withdraw(false);
    }
    else if (key === 'language')
        root.querySelectorAll('[data-language]').forEach(b => { b.disabled = !!state.flow.session.language && state.flow.session.language !== b.dataset.language; b.onclick = () => send({ responses: { language: b.dataset.language } }); });
    else if (key === 'incentive') {
        root.querySelectorAll('input[name="compensationChoice"]').forEach(el => el.onchange = () => $('emailField').classList.toggle('hidden', el.value !== 'receive'));
        $('stageContinue').onclick = () => {
            const choice = root.querySelector('input[name="compensationChoice"]:checked')?.value;
            if (!choice)
                return $('stageError').textContent = 'Choose how you would like to handle compensation.';
            send({ choice, email: choice === 'receive' ? $('compensationEmail').value : undefined });
        };
    }
    else {
        populateAnswers(data.responses);
        installQueue(data.revision, async (answers, rev, requestId) => api(sessionURL(`/stages/${key}`), { method: 'PUT', body: { responses: answers, revision: rev, requestId, final: false } }));
        $('surveyForm').addEventListener('input', () => scheduleSave(collectAnswers()));
        $('surveyForm').onsubmit = async (e) => {
            e.preventDefault();
            const responses = collectAnswers();
            if (Object.values(responses).some(v => v == null || Array.isArray(v) && !v.length) && !await confirmAction('Continue with unanswered items?', 'Unanswered questions will remain recorded as missing. You may return to answer them now, or continue.'))
                return;
            send({ responses });
        };
        $('skipStage').onclick = async () => {
            if (await confirmAction('Skip this section?', 'This is voluntary. Your current answers will be retained, and the section will be marked skipped.'))
                send({ responses: collectAnswers(), skipped: true });
        };
        await recoverDraft(populateAnswers);
    }
}
function formatPythonSource(source) {
    // Conservative study-safe formatter: normalize tabs/trailing whitespace and indentation
    // without rewriting expressions, identifiers, strings, or student logic.
    return String(source || '').replace(/\r\n?/g, '\n').split('\n').map(line => {
        const m = line.match(/^[ \t]*/)?.[0] || '';
        const width = [...m].reduce((n, c) => n + (c === '\t' ? 4 : 1), 0);
        const indent = ' '.repeat(Math.max(0, Math.round(width / 4) * 4));
        return indent + line.slice(m.length).replace(/[ \t]+$/g, '');
    }).join('\n').replace(/\n{3,}$/g, '\n\n').replace(/\s+$/g, '') + (source ? '\n' : '');
}
function formatJavaSource(source) {
    const text = String(source || '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');
    const lines = text.split('\n'), out = [];
    let level = 0;
    for (const original of lines) {
        const line = original.trim();
        if (!line) { if (out.at(-1) !== '') out.push(''); continue; }
        const leadingClose = (line.match(/^}+/)?.[0].length || 0);
        level = Math.max(0, level - leadingClose);
        out.push(' '.repeat(level * 4) + line);
        const stripped = line.replace(/\/\/.*$/g, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
        const opens = (stripped.match(/{/g) || []).length;
        const closes = (stripped.match(/}/g) || []).length;
        level = Math.max(0, level + opens - closes + leadingClose);
    }
    return out.join('\n').replace(/\n{3,}$/g, '\n\n').replace(/\s+$/g, '') + (source ? '\n' : '');
}
function formatCurrentSource(source, language) { return language === 'java' ? formatJavaSource(source) : formatPythonSource(source); }
function initEditor() {
    const fallback = $("fallbackEditor");
    const host = $("editorHost");
    const enableFallback = () => {
        $("editorHelp").textContent = "Basic editor mode. Code entry and saving are available; advanced editing features could not load.";
        host.classList.add("hidden");
        fallback.classList.remove("hidden");
        fallback.addEventListener("input", markDirty);
    };
    if (!window.require)
        return enableFallback();
    try {
        const base = new URL("/vendor/monaco/", location.origin).href;
        window.MonacoEnvironment = {
            getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(`self.MonacoEnvironment={baseUrl:'${base}'};importScripts('${base}vs/base/worker/workerMain.js');`)}`
        };
        window.require.config({ paths: { vs: `${base}vs` } });
        window.require(["vs/editor/editor.main"], () => {
            state.editor = monaco.editor.create(host, {
                value: "",
                language: "python",
                theme: "vs",
                automaticLayout: true,
                fontSize: 15,
                lineHeight: 23,
                minimap: { enabled: false },
                lineNumbers: "on",
                roundedSelection: true,
                scrollBeyondLastLine: false,
                wordWrap: "off",
                tabSize: 4,
                insertSpaces: true,
                autoIndent: "full",
                bracketPairColorization: { enabled: true },
                matchBrackets: "always",
                quickSuggestions: false,
                suggestOnTriggerCharacters: false,
                parameterHints: { enabled: true },
                formatOnPaste: true,
                formatOnType: true,
                folding: true,
                glyphMargin: false
            });
            for (const language of ["python", "java"]) {
                monaco.languages.registerDocumentFormattingEditProvider(language, {
                    provideDocumentFormattingEdits(model) {
                        return [{ range: model.getFullModelRange(), text: formatCurrentSource(model.getValue(), language) }];
                    }
                });
            }
            state.editor.addAction({
                id: 'code-workout-format', label: 'Format Code',
                keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
                run: async editor => {
                    if (state.assignment?.modality_id === 'code-explanation') return;
                    const language = state.assignment?.question_snapshot?.language || 'python';
                    const formatted = formatCurrentSource(editor.getValue(), language);
                    editor.executeEdits('format-code', [{ range: editor.getModel().getFullModelRange(), text: formatted }]);
                    toast('Code formatted.');
                }
            });
            state.editor.onDidChangeModelContent(markDirty);
            state.editor.onDidFocusEditorWidget(() => trackEvent("editor_focus"));
            state.editor.onDidBlurEditorWidget(() => trackEvent("editor_blur"));
            state.monacoReady = true;
            $("editorHelp").textContent = "Syntax highlighting, line numbers, bracket matching, indentation, undo/redo, and Format Code are available. Use Shift+Alt+F or Ctrl+Shift+F to format.";
            if (state.assignment) {
                state.loadingAssignment = true;
                monaco.editor.setModelLanguage(state.editor.getModel(), state.assignment.question_snapshot.language === "java" ? "java" : "python");
                state.editor.setValue(state.queue?.value?.code ?? state.submission?.draft_code ?? state.assignment.question_snapshot.starter_code ?? "");
                state.editor.updateOptions({ readOnly: state.assignment.modality_id === "code-explanation" });
                state.loadingAssignment = false;
            }
        }, enableFallback);
    }
    catch (error) {
        console.warn("Monaco failed to initialize", error);
        enableFallback();
    }
}
function getCode() { return state.editor ? state.editor.getValue() : $('fallbackEditor').value; }
function setCode(code) {
    if (state.editor)
        state.editor.setValue(code || '');
    else
        $('fallbackEditor').value = code || '';
}
function codingValues() { const explanation = state.assignment?.modality_id === 'code-explanation' ? $('explanationInput').value : ''; const inputs = state.assignment?.modality_id === 'code-explanation' ? {} : Object.fromEntries([...document.querySelectorAll('[data-program-input]')].map(el => [el.dataset.programInput, el.value])); return { code: getCode(), explanation, inputs }; }
function populateCoding(v) {
    state.loadingAssignment = true;
    setCode(v.code || '');
    $('explanationInput').value = v.explanation || '';
    document.querySelectorAll('[data-program-input]').forEach(el => {
        if (v.inputs?.[el.dataset.programInput] != null)
            el.value = v.inputs[el.dataset.programInput];
    });
    state.loadingAssignment = false;
}
function markDirty() {
    if (state.loadingAssignment || !state.assignment || !state.queue)
        return;
    scheduleSave(codingValues());
    if (state.lastExecutionText) $('executionStatus').textContent = 'Output from previous run — rerun after edits';
    if (state.lastScore) { state.lastScore = null; $('scoreValue').textContent = '—'; $('scoreSummary').textContent = state.assignment?.modality_id === 'code-explanation' ? 'Explanation changed — check it again for an updated score.' : 'Code changed — run it again for an updated score.'; $('scoreChecks').replaceChildren(); }
}
function trackEvent() { state.activeInputAt = Date.now(); }
function showScore(result) {
    const grade = result?.score && typeof result.score === 'object' ? result.score : result;
    state.lastScore = grade && grade.score != null ? grade : null;
    $('scoreValue').textContent = grade?.score == null ? '—' : `${grade.score}/100`;
    $('scoreSummary').textContent = grade?.summary || (grade?.unavailable ? 'Scoring is temporarily unavailable. Your work and program output are still saved.' : 'Run your code or check your explanation to see a score.');
    $('scoreChecks').innerHTML = (grade?.checks || []).map(c => `<li class="${c.passed ? 'pass' : 'needs-work'}">${c.passed ? '✓' : '○'} ${esc(c.label)}</li>`).join('');
}
function questionPosition(assignment) {
    const order = state.flow.modalityOrder || state.flow.modalities.map(m => m.id);
    let before = 0;
    for (const id of order) {
        if (id === assignment.modality_id) break;
        before += state.flow.modalities.find(m => m.id === id)?.count || 0;
    }
    const total = state.flow.modalities.reduce((n, m) => n + m.count, 0);
    return { index: before + assignment.question_order, total };
}
function renderModalities() {
    state.assignment = null;
    state.queue = null;
    const f = state.flow, completedModalities = f.modalities.filter(m => m.completed);
    const totalQuestions = f.modalities.reduce((n, m) => n + m.count, 0);
    const completedQuestions = completedModalities.reduce((n, m) => n + m.count, 0);
    $('progressText').textContent = `${completedQuestions} of ${totalQuestions} questions completed`;
    $('progressBar').style.width = `${totalQuestions ? completedQuestions / totalQuestions * 100 : 0}%`;
    $('studyCompletedBanner').classList.toggle('hidden', completedModalities.length !== f.modalities.length);
    $('modalityGrid').replaceChildren();
    let firstQuestion = 1;
    for (const m of f.modalities) {
        const b = document.createElement('button');
        b.className = 'modality-card' + (m.completed ? ' completed' : '');
        b.disabled = m.completed || m.locked;
        const lastQuestion = firstQuestion + m.count - 1;
        const range = m.count === 1 ? `Question ${firstQuestion} of ${totalQuestions}` : `Questions ${firstQuestion}–${lastQuestion} of ${totalQuestions}`;
        b.innerHTML = `<h3>${esc(m.label)}</h3><p>${m.id === 'problem-solving' ? 'Write code to complete the task.' : m.id === 'debugging' ? 'Find and fix an error in the code.' : 'Explain what the provided code does.'}</p><span class="status">${m.completed ? `✓ Completed · ${range}` : m.locked ? `🔒 Locked · ${range}` : `${range} · Ready`}</span>`;
        b.onclick = () => startModality(m.id);
        $('modalityGrid').appendChild(b);
        firstQuestion = lastQuestion + 1;
    }
    showScreen('modalityScreen');
}
async function startModality(modality) {
    if (state.busy)
        return;
    state.busy = true;
    try {
        await flush();
        const data = await api('/api/modality/start', { method: 'POST', body: { sessionId: state.flow.session.id, modalityId: modality } });
        state.modality = modality;
        state.queue = null;
        if (data.review)
            renderReview(data.review);
        else
            await loadAssignment(data);
    }
    catch (e) {
        toast(e.message);
    }
    finally {
        state.busy = false;
    }
}
async function loadAssignment(data) {
    state.assignment = data.assignment;
    state.submission = data.submission;
    state.lastExecutionText = '';
    state.lastScore = null;
    state.loadingAssignment = true;
    const a = state.assignment, q = a.question_snapshot, cfg = state.flow.config, isExplanation = a.modality_id === 'code-explanation';
    const position = questionPosition(a);
    state.totalQuestions = position.total;
    $('taskTitle').textContent = q.title;
    $('taskId').textContent = q.id;
    $('taskPrompt').textContent = q.prompt;
    $('languagePill').textContent = q.language;
    $('modalityPill').textContent = state.flow.modalities.find(m => m.id === a.modality_id)?.label;
    $('difficultyPill').textContent = q.difficulty;
    $('questionProgressText').textContent = `Question ${position.index} of ${position.total}`;
    $('questionProgressBar').style.width = `${Math.max(0, (position.index - 1) / position.total * 100)}%`;
    $('traceInstructions').classList.toggle('hidden', !isExplanation);
    $('explanationSection').classList.toggle('hidden', !isExplanation);
    $('formatCode').classList.toggle('hidden', isExplanation);
    $('checkExplanation').classList.toggle('hidden', !isExplanation);
    $('outputPanel').classList.toggle('hidden', isExplanation);
    $('structuredInputs').classList.toggle('hidden', isExplanation);
    $('runCode').classList.toggle('hidden', isExplanation || !cfg.executionEnabled);
    $('explanationLabel').textContent = 'Your explanation';
    const fields = q.inputSchema || [];
    $('structuredInputs').innerHTML = fields.length ? `<h3>Inputs for this exercise</h3><p class="muted small-text">Fill in each value below. The platform sends them in this order; you do not need to type line breaks or press Enter between inputs.</p><div class="input-grid">${fields.map(f => `<div><label for="input_${esc(f.id)}">${esc(f.label)}</label><input id="input_${esc(f.id)}" data-program-input="${esc(f.id)}" inputmode="${['integer', 'number'].includes(f.type) ? 'decimal' : 'text'}" maxlength="512" placeholder="Example: ${esc(f.example || '')}" value="${esc(data.submission.draft_inputs?.[f.id] ?? f.default ?? '')}" aria-describedby="help_${esc(f.id)}"><p id="help_${esc(f.id)}" class="muted small-text">${esc(f.help || 'Enter one value.')}</p></div>`).join('')}</div>` : '<p class="muted small-text">This exercise has no separate inputs. Use the values provided in the question or starter code.</p>';
    $('feedbackType').innerHTML = cfg.feedbackTypes.map(t => `<option value="${t}">${esc(t.charAt(0).toUpperCase() + t.slice(1))}</option>`).join('');
    const ai = cfg.aiEnabled && cfg.aiModalities.includes(a.modality_id);
    $('getFeedback').classList.toggle('hidden', !ai);
    $('feedbackTypeField').classList.toggle('hidden', !ai);
    $('aiFeedback').textContent = ai ? 'Request feedback when you are ready. It is separate from your score and actual program output.' : 'AI feedback is not enabled for this activity.';
    $('programOutput').textContent = 'Run your code to see compilation/runtime output here.';
    $('executionStatus').textContent = 'Not run';
    showScore(null);
    $('scoreSummary').textContent = isExplanation ? 'Write your explanation, then choose Check Explanation to see a score.' : 'Run your code to see a correctness score.';
    populateCoding({ code: data.submission.draft_code ?? q.starter_code, explanation: data.submission.draft_explanation, inputs: data.submission.draft_inputs });
    if (state.editor) {
        monaco.editor.setModelLanguage(state.editor.getModel(), q.language);
        state.editor.updateOptions({ readOnly: isExplanation });
    }
    else $('fallbackEditor').readOnly = isExplanation;
    $('editorHelp').textContent = isExplanation ? 'Read-only code. Use the explanation box below to describe what the code does.' : 'Syntax highlighting, line numbers, bracket matching, indentation, undo/redo, and Format Code are available.';
    const operations = data.operations || [];
    const fb = operations.filter(o => o.kind === 'feedback');
    $('feedbackCount').textContent = `${fb.length} request${fb.length === 1 ? '' : 's'}`;
    const lastFb = fb.filter(o => o.status === 'succeeded').at(-1);
    if (lastFb) $('aiFeedback').textContent = lastFb.result.feedback;
    const lastRun = operations.filter(o => o.kind === 'execute' && o.status === 'succeeded').at(-1);
    if (lastRun) {
        showOutput(lastRun.result);
        if (lastRun.result?.score) showScore(lastRun.result.score);
    }
    const lastExplanationScore = operations.filter(o => o.kind === 'score' && o.status === 'succeeded').at(-1);
    if (lastExplanationScore) showScore(lastExplanationScore.result);
    if (data.submission.final_score != null && !state.lastScore) showScore({ score: data.submission.final_score, summary: 'Saved final score.', checks: data.submission.score_details?.checks || [] });
    state.loadingAssignment = false;
    installQueue(data.submission.revision, async (value, rev, requestId) => api('/api/draft', { method: 'PUT', body: { sessionId: state.flow.session.id, assignmentId: a.id, ...value, revision: rev, requestId, final: false } }));
    document.querySelectorAll('[data-program-input]').forEach(el => el.addEventListener('input', markDirty));
    showScreen('workspaceScreen');
    requestAnimationFrame(() => state.editor?.layout());
    await recoverDraft(populateCoding);
}
function showOutput(r) {
    const parts = [];
    if (r.stdout)
        parts.push(r.stdout);
    if (r.compileOutput)
        parts.push('Compilation errors:\n' + r.compileOutput);
    if (r.stderr)
        parts.push('Runtime errors:\n' + r.stderr);
    if (r.message)
        parts.push(r.message);
    state.lastExecutionText = parts.join('\n\n') || '(No output)';
    $('programOutput').textContent = state.lastExecutionText;
    $('executionStatus').textContent = `${r.status || 'Finished'}${r.runtimeMs != null ? ' · ' + r.runtimeMs + ' ms' : ''}`;
    if (state.editor && window.monaco) {
        const t = [r.stderr, r.compileOutput].filter(Boolean).join('\n'), m = t.match(/(?:line\s+|Main\.java:)(\d+)/);
        monaco.editor.setModelMarkers(state.editor.getModel(), 'execution', m ? [{ severity: monaco.MarkerSeverity.Error, startLineNumber: Math.min(Number(m[1]), state.editor.getModel().getLineCount()), endLineNumber: Math.min(Number(m[1]), state.editor.getModel().getLineCount()), startColumn: 1, endColumn: 200, message: t.slice(0, 3000) }] : []);
    }
}
function lockEditor(locked) {
    state.editor?.updateOptions({ readOnly: locked || state.modality === 'code-explanation' });
    $('fallbackEditor').readOnly = locked || state.modality === 'code-explanation';
    $('explanationInput').disabled = locked;
    document.querySelectorAll('#structuredInputs input').forEach(x => x.disabled = locked);
}
function disableActions(busy) {
    ['runCode', 'checkExplanation', 'getFeedback', 'saveFinal', 'skipQuestion', 'backToModalities', 'formatCode'].forEach(id => $(id).disabled = busy);
    if (state.modality === 'code-explanation') $('formatCode').disabled = true;
}
async function runOperation(kind) {
    if (state.busy || !state.assignment) return;
    state.busy = true;
    disableActions(true);
    const values = codingValues(), a = state.assignment;
    try {
        await flush();
        if (kind === 'execute') {
            $('executionStatus').textContent = 'Running';
            $('programOutput').textContent = 'Executing in the sandbox…';
            $('scoreValue').textContent = '…';
            $('scoreSummary').textContent = 'Running and checking your code…';
            $('scoreChecks').replaceChildren();
        }
        if (kind === 'score') {
            $('scoreValue').textContent = '…';
            $('scoreSummary').textContent = 'Checking your explanation…';
            $('scoreChecks').replaceChildren();
        }
        const key = a.id + ':' + kind, payload = { sessionId: state.flow.session.id, assignmentId: a.id, ...values, feedbackType: $('feedbackType').value };
        const fingerprint = JSON.stringify(payload);
        let attempt = operationRetries.get(key);
        if (!attempt || attempt.fingerprint !== fingerprint) {
            attempt = { fingerprint, id: uid() };
            operationRetries.set(key, attempt);
        }
        const op = await api(`/api/${kind}`, { method: 'POST', body: { ...payload, requestId: attempt.id } });
        operationRetries.delete(key);
        if (op.status !== 'succeeded') throw new Error(op.result?.error || 'This request did not complete.');
        if (kind === 'execute') {
            showOutput(op.result);
            showScore(op.result.score);
            if (getCode() !== values.code) $('executionStatus').textContent += ' · earlier code revision';
        }
        else if (kind === 'score') showScore(op.result);
        else {
            $('aiFeedback').textContent = op.result.feedback;
            $('feedbackCount').textContent = `${op.requestNumber} requests`;
        }
        api(sessionURL('/operations/' + op.id + '/displayed'), { method: 'POST', body: {} }).catch(() => { });
    }
    catch (e) {
        operationRetries.delete(a.id + ':' + kind);
        if (kind === 'execute') {
            $('executionStatus').textContent = 'Execution unavailable';
            $('programOutput').textContent = e.message;
            showScore({ score: null, summary: 'A score could not be calculated because the program did not run.', checks: [] });
        }
        else if (kind === 'score') showScore({ score: null, summary: e.message, checks: [] });
        else toast(e.message);
    }
    finally {
        state.busy = false;
        disableActions(false);
    }
}
async function finalizeQuestion(skipped = false) {
    if (state.busy || !state.assignment)
        return;
    if (!await confirmAction(skipped ? 'Skip this question?' : 'Save final response?', skipped ? 'This question will be recorded as skipped. Any current work will be preserved.' : 'Your final response will be locked. You will move to the next question or review this modality.'))
        return;
    state.busy = true;
    disableActions(true);
    lockEditor(true);
    const a = state.assignment;
    try {
        await flush();
        const rev = state.queue.revision;
        await api('/api/draft', { method: 'PUT', body: { sessionId: state.flow.session.id, assignmentId: a.id, ...(finalRetries.get(a.id) || (() => { const v = { ...codingValues(), revision: rev, requestId: uid(), final: true, skipped }; finalRetries.set(a.id, v); return v; })()) } });
        finalRetries.delete(a.id);
        if (state.flow.config.preventDuplicateEntries && state.account?.code) { try { localStorage.setItem('cw4-entry-lock', state.account.code); } catch {} }
        clearCache();
        state.queue = null;
        state.busy = false;
        await startModality(a.modality_id);
    }
    catch (e) {
        if (e.status && e.status < 500)
            finalRetries.delete(a.id);
        toast(e.message + (finalRetries.has(a.id) ? " Retry Save Final to confirm the same submission, or refresh to check saved progress." : ""));
    }
    finally {
        state.busy = false;
        disableActions(false);
        lockEditor(finalRetries.has(state.assignment?.id));
    }
}
function renderReview(items) { state.assignment = null; state.queue = null; $('reviewTitle').textContent = 'Review your saved responses'; $('reviewList').innerHTML = items.map(({ assignment: a, submission: s }) => { const explanation = a.modality_id === 'code-explanation' ? `<h4>Saved explanation</h4><p>${esc(s.final_explanation || '(none)')}</p>` : ''; return `<details class="review-item"><summary>Question ${a.question_order}: ${esc(a.question_snapshot.title)}${s.skipped ? ' — skipped' : ''}</summary><div class="review-body"><h4>Question</h4><p>${esc(a.question_snapshot.prompt)}</p><h4>Saved code</h4><pre>${esc(s.final_code || '(none)')}</pre>${explanation}${s.final_score != null ? `<h4>Score</h4><p>${esc(s.final_score)}/100</p>` : ''}</div></details>`; }).join(''); showScreen('reviewScreen'); }
async function completeCoding() {
    try {
        const st = state.flow.stages.find(s => s.key === 'coding');
        const r = await api(sessionURL('/stages/coding'), { method: 'PUT', body: { revision: st.revision, requestId: uid(), final: true, responses: {} } });
        await applyFlow(r.state);
    }
    catch (e) {
        toast(e.message);
    }
}
async function showCompletion() {
    showScreen('completionScreen');
    const s = state.flow.session, contact = state.flow.config.contact;
    let message = s.status === 'completed' ? 'Your responses for this practice session have been saved. Thank you for participating.' : 'You have stopped this session. No further study activities are required. Saved identifiable data are not automatically deleted; contact the research team about withdrawal of data.';
    $('completionTitle').textContent = s.status === 'completed' ? `Session ${s.number} complete` : 'Participation ended';
    $('completionContent').innerHTML = `<p>${esc(message)}</p>${s.status === 'completed' ? '<div class="completion-banner"><h3>Another practice session is coming up</h3><p>You can participate again in another practice session in a couple of weeks. Use the same Participant ID and private access key so your sessions remain linked.</p></div>' : ''}<p>Keep your Participant ID and private access key for future sessions.</p><p class="mono">Participant ID: ${esc(state.account.code)}<br>Session ID: ${esc(s.id)}</p><p class="muted">${esc(contact.name)} · ${esc(contact.email)} · ${esc(contact.phone)}</p>`;
    try {
        const c = await api(sessionURL('/claim'));
        if (c) {
            const block = document.createElement('div');
            block.className = 'completion-banner';
            block.innerHTML = `<h3>Compensation record</h3><p>Status: ${esc(c.status.replaceAll('_', ' '))}. Claim reference: <span class="mono">${esc(c.id)}</span>.</p><p>This confirms the record was saved, not that a gift card was sent.</p>`;
            if (c.status === 'contact_pending') {
                block.innerHTML += '<label for="laterEmail">Provide your gift-card email now (optional)</label><input id="laterEmail" type="email" autocomplete="email"><button id="saveLaterEmail" class="primary">Save contact separately</button>';
            }
            $('completionContent').appendChild(block);
            if ($('saveLaterEmail'))
                $('saveLaterEmail').onclick = async () => {
                    try {
                        await api(sessionURL('/claim'), { method: 'PUT', body: { email: $('laterEmail').value } });
                        await showCompletion();
                    }
                    catch (e) {
                        toast(e.message);
                    }
                };
        }
    }
    catch (e) {
        toast(e.message);
    }
}
async function withdraw(ask = true) {
    if (ask && !await confirmAction('Stop participating?', 'You may stop without affecting your grade or standing. Your saved research records are retained unless you separately request data withdrawal.'))
        return;
    const requestDataWithdrawal = ask ? await confirmAction('Request withdrawal of identifiable data?', 'Confirm to record a request for the research team to review. This does not immediately delete data. Choose Cancel to stop participation without requesting removal.') : false;
    try {
        await api(sessionURL('/withdraw'), { method: 'POST', body: { requestDataWithdrawal } });
        clearCache();
        state.queue = null;
        await applyFlow(await api(sessionURL()));
    }
    catch (e) {
        toast(e.message);
    }
}
$('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!state.preflight?.consented) { renderPreflightConsent(); return; }
    $('loginError').textContent = '';
    try {
        const r = await api('/api/auth/login', { method: 'POST', body: { participantId: $('participantId').value, accessKey: $('accessKey').value } });
        state.csrf = r.csrf;
        $('accessKey').value = '';
        await loadAccount(true);
    }
    catch (e) {
        $('loginError').textContent = e.message;
    }
};
$('saveExit').onclick = async () => {
    if (state.queue?.dirty && !await confirmAction('Save and exit?', 'Your current research draft will be saved before signing out. Unsaved consent signatures and compensation email fields are not stored as drafts.'))
        return;
    try {
        await flush();
        await api('/api/auth/logout', { method: 'POST', body: {} });
        Object.keys(sessionStorage).filter(k => k.startsWith('cw3:')).forEach(k => sessionStorage.removeItem(k));
        location.reload();
    }
    catch (e) {
        toast(e.message);
    }
};
$('stopStudy').onclick = () => withdraw();
$('viewSessions').onclick = () => loadAccount(false).catch(e => toast(e.message));
$('codingContinue').onclick = completeCoding;
$('runCode').onclick = () => runOperation('execute');
$('checkExplanation').onclick = () => runOperation('score');
$('getFeedback').onclick = () => runOperation('feedback');
$('saveFinal').onclick = () => finalizeQuestion(false);
$('skipQuestion').onclick = () => finalizeQuestion(true);
$('completeModality').onclick = async () => {
    if (state.busy || !await confirmAction('Complete this modality?', 'This locks the modality for this session.'))
        return;
    state.busy = true;
    try {
        const f = await api('/api/modality/complete', { method: 'POST', body: { sessionId: state.flow.session.id, modalityId: state.modality } });
        await applyFlow(f);
    }
    catch (e) {
        toast(e.message);
    }
    finally {
        state.busy = false;
    }
};
$('backToModalities').onclick = async () => {
    try {
        await flush();
        await applyFlow(await api(sessionURL()));
    }
    catch (e) {
        toast(e.message);
    }
};
$('explanationInput').addEventListener('input', markDirty);
$('formatCode').onclick = async () => {
    if (state.assignment?.modality_id === 'code-explanation') return;
    if (state.editor) {
        const action = state.editor.getAction('code-workout-format');
        if (action) await action.run();
        else { const language = state.assignment?.question_snapshot?.language || 'python'; setCode(formatCurrentSource(getCode(), language)); toast('Code formatted.'); }
    }
    else {
        const language = state.assignment?.question_snapshot?.language || 'python';
        setCode(formatCurrentSource(getCode(), language));
        markDirty();
        toast('Code formatted.');
    }
};
for (const name of ['pointerdown', 'keydown', 'input'])
    document.addEventListener(name, () => state.activeInputAt = Date.now(), { passive: true });
window.addEventListener('beforeunload', e => {
    if (state.queue?.dirty) {
        cacheDraft();
        e.preventDefault();
        e.returnValue = '';
    }
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.queue?.dirty) {
        cacheDraft();
        state.queue.flush().catch(() => { });
    }
});
setInterval(() => {
    if (state.queue?.dirty && !state.queue.conflict)
        state.queue.flush().catch(() => { });
}, 7000);
setInterval(() => {
    if (state.flow?.session.status === 'active' && state.flow.session.consentedAt && !document.hidden && Date.now() - state.activeInputAt < 60000)
        api(sessionURL('/heartbeat'), { method: 'POST', body: { stage: state.flow.currentStage } }).catch(() => { });
}, 30000);
function renderAccessSetup() {
    $('accessSetupError').textContent = '';
    $('generatedAccess').classList.add('hidden');
    $('accessCreationForm').classList.remove('hidden');
    $('savedStudyAccess').checked = false;
    $('continueWithStudyAccess').disabled = true;
    let lockedId = '';
    try { lockedId = localStorage.getItem('cw4-entry-lock') || ''; } catch {}
    if (state.publicInfo?.preventDuplicateEntries && lockedId) {
        $('participantId').value = lockedId;
        $('loginError').textContent = 'This browser already started a research entry. Sign in with the same Participant ID and Private Access Key to resume it.';
        return showScreen('participantScreen');
    }
    showScreen('accessSetupScreen');
}
$('consentYes').onclick = () => {
    $('preflightConsentError').textContent = '';
    const signature = $('preflightSignature').value.trim();
    if (!$('preflightAgree').checked) return $('preflightConsentError').textContent = 'Please confirm that you agree to participate before continuing.';
    if (signature.length < 2) return $('preflightConsentError').textContent = 'Type your name to sign the consent form.';
    state.preflight = { consented: true, signature, acceptedAt: new Date().toISOString(), documentVersion: state.publicInfo.consent.version };
    sessionStorage.setItem('cw4-preflight', JSON.stringify(state.preflight));
    renderAccessSetup();
};
$('generateStudyAccess').onclick = async () => {
    $('accessSetupError').textContent = '';
    if (!state.preflight?.consented) return renderPreflightConsent();
    try {
        $('generateStudyAccess').disabled = true;
        const r = await api('/api/participants/self-enroll', { method: 'POST', body: { participantId: $('newStudyParticipantId').value, consentAccepted: true, consentVersion: state.preflight.documentVersion, signature: state.preflight.signature } });
        state.csrf = r.csrf;
        $('generatedParticipantId').textContent = r.code;
        $('generatedAccessKey').textContent = r.accessKey;
        $('accessCreationForm').classList.add('hidden');
        $('generatedAccess').classList.remove('hidden');
    }
    catch (e) { $('accessSetupError').textContent = e.message; }
    finally { $('generateStudyAccess').disabled = false; }
};
$('savedStudyAccess').onchange = () => $('continueWithStudyAccess').disabled = !$('savedStudyAccess').checked;
$('copyStudyAccess').onclick = async () => {
    const text = `Participant ID: ${$('generatedParticipantId').textContent}\nPrivate Access Key: ${$('generatedAccessKey').textContent}`;
    try { await navigator.clipboard.writeText(text); toast('Study access copied. Keep it in a safe place.'); } catch { toast('Copy was unavailable. Please save the Participant ID and Private Access Key manually.'); }
};
$('continueWithStudyAccess').onclick = async () => {
    if (!$('savedStudyAccess').checked) return;
    try { await loadAccount(true); } catch (e) { $('accessSetupError').textContent = e.message; }
};
$('showReturningLogin').onclick = () => { $('loginError').textContent = ''; showScreen('participantScreen'); };
$('backToAccessSetup').onclick = renderAccessSetup;
$('consentNo').onclick = () => {
    state.preflight = null;
    sessionStorage.removeItem('cw4-preflight');
    $('declineContact').textContent = `Questions about the non-research course-credit option: ${state.publicInfo.contact.name} · ${state.publicInfo.contact.email} · ${state.publicInfo.contact.phone}`;
    showScreen('declineScreen');
};
async function boot() {
    initEditor();
    try {
        state.publicInfo = await api('/api/public');
        $('loginContact').textContent = `${state.publicInfo.contact.name} (${state.publicInfo.contact.email})`;
        try { state.preflight = JSON.parse(sessionStorage.getItem('cw4-preflight') || 'null'); } catch { state.preflight = null; }
        //if (state.publicInfo.notice) {
           // $('reviewNotice').textContent = state.publicInfo.notice;
           // $('reviewNotice').classList.remove('hidden');
        //}
        // Resolve public configuration before showing a participant-facing stage; this prevents startup screen flicker.
        if (state.preflight?.consented) renderAccessSetup(); else renderPreflightConsent();
    }
    catch (e) {
        $('loadingTitle').textContent = 'The study page could not be loaded';
        $('loadingScreen').querySelector('.muted').textContent = e.message;
        showScreen('loadingScreen');
    }
}
boot();
