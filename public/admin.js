const $ = id => document.getElementById(id);
let token = '', configuration = null, revision = 0, currentHash = '', liveCollectionEnabled = false, remoteSelfEnrollmentOpen = false, blockers = [], deploymentIssues = [];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function request(path, { method = 'GET', body, download } = {}) {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) {
        let d = {};
        try { d = await r.json(); } catch {}
        throw new Error(d.error || 'Request failed.');
    }
    if (download) {
        const b = await r.blob(), url = URL.createObjectURL(b), a = document.createElement('a');
        a.href = url; a.download = download; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
    }
    return r.json();
}
const guarded = fn => async (...args) => {
    try { $('adminError').textContent = ''; await fn(...args); }
    catch (e) { $('adminError').textContent = e.message; }
};
function reviewItemLabel(key) { return key === 'remote_delivery' ? 'delivery mode and session setting' : key.replaceAll('_', ' '); }
function readinessLabel(x) {
    return String(x).replace(/^Release configuration:\s*/i, '').replace(/^Deployment:\s*/i, '').replace(/\.$/, '');
}
function renderReleaseReadiness() {
    $('liveSwitchStatus').textContent = remoteSelfEnrollmentOpen
        ? 'Remote participant self-enrollment is OPEN. Students can create their own Participant ID and Private Access Key from the public study page.'
        : liveCollectionEnabled
            ? 'Deployment switch: LIVE_COLLECTION_ENABLED=true, but remote self-enrollment is not currently open.'
            : 'Deployment switch: LIVE_COLLECTION_ENABLED is not true. Real enrollment remains blocked.';
    const items = [];
    if (configuration.release?.status === 'approved') items.push({ ok: true, text: 'Study configuration is marked approved for release.' });
    else items.push({ ok: false, text: `Study release status is ${configuration.release?.status || 'not set'}.` });
    if (currentHash && configuration.release?.reviewedContentHash === currentHash) items.push({ ok: true, text: 'Approved content hash matches the current participant content.' });
    else items.push({ ok: false, text: 'Approved content hash does not match the current participant content.' });
    if (liveCollectionEnabled) items.push({ ok: true, text: 'Deployment live-collection switch is enabled.' });
    if (remoteSelfEnrollmentOpen) items.push({ ok: true, text: 'Remote self-enrollment is enabled for participants.' });
    for (const issue of deploymentIssues) items.push({ ok: false, text: `Deployment setup: ${issue}` });
    for (const b of blockers) {
        const text = readinessLabel(b);
        if (!items.some(x => x.text.toLowerCase().includes(text.toLowerCase().slice(0, 24)))) items.push({ ok: false, text });
    }
    $('releaseReadiness').innerHTML = items.map(x => `<div class="release-item ${x.ok ? 'ok' : 'blocked'}"><strong>${x.ok ? '✓' : '!'}</strong><span>${esc(x.text)}</span></div>`).join('');
}
function renderControls() {
    const config = configuration;
    $('configEditor').value = JSON.stringify(config, null, 2);
    $('stageToggles').innerHTML = Object.entries(config.stages).map(([key, enabled]) => `<label class="option-label"><input type="checkbox" data-stage="${key}" ${enabled ? 'checked' : ''}><span>${esc(reviewItemLabel(key))}</span></label>`).join('');
    $('sessionToggles').innerHTML = config.sessions.map(s => `<label class="option-label"><input type="checkbox" data-session="${s.number}" ${s.open ? 'checked' : ''}><span>Open ${esc(s.label)}</span></label>`).join('');
    $('releaseStatus').textContent = `Release: ${config.release.status}. Current content hash: ${currentHash}. Information, consent and language safeguards remain server-controlled.`;
    $('releaseStatusSelect').value = config.release?.status || 'draft';
    $('approvalReference').value = config.release?.approvalReference || '';
    $('releaseReviewChecks').innerHTML = Object.entries(config.release?.reviewed || {}).map(([key, value]) => `<label class="option-label"><input type="checkbox" data-release-review="${esc(key)}" ${value ? 'checked' : ''}><span>${esc(reviewItemLabel(key))}</span></label>`).join('');
    $('toggleDuplicateProtection').textContent = `Duplicate-entry protection: ${config.preventDuplicateEntries !== false ? 'ON' : 'OFF'}`;
    $('duplicateStatus').textContent = config.preventDuplicateEntries !== false ? 'New study sessions will lock after the first finalized research question.' : 'Protection is off for newly created sessions.';
    renderReleaseReadiness();
}
async function loadConfiguration() {
    const c = await request('/api/admin/config');
    configuration = c.config; revision = c.revision; currentHash = c.contentHash;
    liveCollectionEnabled = c.liveCollectionEnabled === true; remoteSelfEnrollmentOpen = c.remoteSelfEnrollmentOpen === true; blockers = c.releaseBlockers || []; deploymentIssues = c.deploymentIssues || [];
    renderControls();
}
async function refresh() {
    const test = $('includeTest').checked;
    const d = await request(`/api/admin/dashboard?includeTest=${test}`);
    $('metricGrid').innerHTML = Object.entries(d.metrics).map(([k, v]) => `<div class="metric"><strong>${esc(v ?? '—')}</strong><span>${esc(k.replace(/([A-Z])/g, ' $1'))}</span></div>`).join('');
    $('longitudinalRows').innerHTML = d.participants.map(p => `<tr><td>${esc(p.participantCode)}</td>${[1, 2, 3].map(n => { const s = p.sessions[n]; return `<td>${s ? `${esc(s.status)}${s.entryLockedAt ? ' · ENTRY LOCKED' : ''}${s.withdrawalRequestedAt ? ' · DATA WITHDRAWAL REQUEST' : ''}<br><span class="small-text">${esc(s.sessionId)}</span>` : '—'}</td>`; }).join('')}</tr>`).join('');
    const score = s => s ? `${s.earned ?? 'missing'} / ${s.maximum} (${s.nAnswered}/${s.nItems} answered)` : 'Not administered';
    $('testRows').innerHTML = d.testPairs.map(p => `<tr><td>${esc(p.participantCode)}</td><td>${p.number}</td><td>${esc(score(p.pre))}</td><td>${esc(score(p.post))}</td></tr>`).join('');
    $('languageStats').innerHTML = Object.entries(d.languageUsage).map(([l, n]) => `<p>${esc(l)}: <strong>${n}</strong> session(s)</p>`).join('');
}
$('adminLoginForm').onsubmit = guarded(async (e) => { e.preventDefault(); token = $('adminToken').value; await loadConfiguration(); await refresh(); $('adminToken').value = ''; $('loginCard').classList.add('hidden'); $('dashboard').classList.remove('hidden'); });
$('adminLogout').onclick = () => { token = ''; location.reload(); };
$('refreshDashboard').onclick = guarded(async () => { await loadConfiguration(); await refresh(); });
$('includeTest').onchange = guarded(refresh);
const exportOptions = [
    ['pre-survey', 'Pre-survey responses'], ['post-survey', 'Post-survey responses'], ['pre-post-surveys', 'Combined pre/post surveys'],
    ['participants', 'Participants'], ['sessions', 'Sessions'], ['stages', 'All workflow stages'], ['assignments', 'Assignments'], ['submissions', 'Submissions and scores'], ['operations', 'Run / feedback / score operations'], ['drafts', 'Draft events'], ['events', 'Audit events'], ['modalities', 'Modality completions']
];
$('exportTable').innerHTML = exportOptions.map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
$('exportCsv').onclick = guarded(() => request(`/api/admin/export/${$('exportTable').value}.csv?includeTest=${$('includeTest').checked}`, { download: `${$('exportTable').value}.csv` }));
$('exportXlsx').onclick = guarded(() => request(`/api/admin/export.xlsx?includeTest=${$('includeTest').checked}`, { download: 'code-workout-research.xlsx' }));
$('enrollParticipant').onclick = guarded(async () => {
    $('enrollmentResult').textContent = '';
    const r = await request('/api/admin/participants', { method: 'POST', body: { participantId: $('newParticipantCode').value || undefined, isTest: $('newIsTest').checked, language: $('newParticipantLanguage').value } });
    $('enrollmentResult').textContent = `Participant ID: ${r.code}\nPrivate access key: ${r.accessKey}\nLanguage: ${$('newParticipantLanguage').value}\nTest account: ${r.isTest}\nDeliver this privately. The key will not be displayed again.`;
});
$('resetKey').onclick = guarded(async () => {
    if (!confirm('Reset this participant’s private key and invalidate existing sign-ins?')) return;
    const r = await request('/api/admin/participants/reset', { method: 'POST', body: { participantId: $('newParticipantCode').value } });
    $('enrollmentResult').textContent = `Participant ID: ${r.code}\nNew private access key: ${r.accessKey}`;
});
$('applyJSON').onclick = guarded(async () => { configuration = JSON.parse($('configEditor').value); renderControls(); });
$('recordContentHash').onclick = () => {
    configuration.release.reviewedContentHash = currentHash;
    $('configEditor').value = JSON.stringify(configuration, null, 2);
    renderControls();
    $('adminError').textContent = 'Current content hash recorded locally. Save release settings to persist it.';
};
$('saveReleaseSettings').onclick = guarded(async () => {
    configuration.release.status = $('releaseStatusSelect').value;
    configuration.release.approvalReference = $('approvalReference').value.trim();
    document.querySelectorAll('[data-release-review]').forEach(el => configuration.release.reviewed[el.dataset.releaseReview] = el.checked);
    const r = await request('/api/admin/config', { method: 'PUT', body: { config: configuration, revision } });
    configuration = r.config; revision = r.revision;
    await loadConfiguration();
    $('adminError').textContent = 'Release settings saved.';
});
$('toggleDuplicateProtection').onclick = guarded(async () => {
    configuration.preventDuplicateEntries = configuration.preventDuplicateEntries === false;
    const r = await request('/api/admin/config', { method: 'PUT', body: { config: configuration, revision } });
    configuration = r.config; revision = r.revision;
    await loadConfiguration();
    $('adminError').textContent = `Duplicate-entry protection is now ${configuration.preventDuplicateEntries !== false ? 'ON' : 'OFF'} for new sessions.`;
});
$('saveConfig').onclick = guarded(async () => {
    document.querySelectorAll('[data-stage]').forEach(el => configuration.stages[el.dataset.stage] = el.checked);
    document.querySelectorAll('[data-session]').forEach(el => configuration.sessions.find(s => s.number === Number(el.dataset.session)).open = el.checked);
    const r = await request('/api/admin/config', { method: 'PUT', body: { config: configuration, revision } });
    configuration = r.config; revision = r.revision;
    await loadConfiguration();
    $('adminError').textContent = 'Configuration saved for new sessions.';
});
