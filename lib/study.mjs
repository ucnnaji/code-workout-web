import { loadJSON, hashObject, STAGES, STAGE_LABELS, MODALITIES, fail, object } from './core.mjs';
const sourceRoot = new URL('../', import.meta.url);
export const defaultConfig = loadJSON(new URL('config/study.json', sourceRoot));
const consent = loadJSON(new URL('content/consent.json', sourceRoot));
export const consentDocument = consent;
const surveys = loadJSON(new URL('content/surveys.json', sourceRoot));
const assessments = loadJSON(new URL('content/assessments.json', sourceRoot));
export const inputSchemas = loadJSON(new URL('content/input-schemas.json', sourceRoot));
const questionBank = loadJSON(new URL('questions.seed.json', sourceRoot));
export const questionBankRelease = questionBank.map(q => ({ ...q, active: typeof q.active === 'boolean' ? q.active : q.modality_id !== 'code-completion', inputSchema: inputSchemas.questions[q.id] || [] }));
export const questionBankHash = hashObject(questionBankRelease);
function releaseConfig(config) {
    const cfg = structuredClone(config);
    delete cfg.release;
    // Opening/closing an already-reviewed session is an operational switch, not a content change.
    if (Array.isArray(cfg.sessions)) cfg.sessions = cfg.sessions.map(({ open, ...session }) => session);
    return cfg;
}
export function contentHashForConfig(config = defaultConfig) {
    return hashObject({ consent, surveys, assessments, inputSchemas, questionBank, config: releaseConfig(config) });
}
export const contentHash = contentHashForConfig(defaultConfig);

export function validateConfig(c) {
    object(c);
    object(c.stages);
    if (Object.keys(c.stages).some(k => !Object.hasOwn(defaultConfig.stages, k)))
        fail('Only optional workflow stages may be configured. Research information, consent, language and completion are mandatory.');
    if (c.studyKey !== defaultConfig.studyKey || c.workflowVersion !== '4.0.0')
        fail('Study key and workflow version cannot be changed in the dashboard.');
    if (!['remote', 'in_person'].includes(c.deliveryMode))
        fail('Invalid delivery mode.');
    if (!['three_each', 'assigned_crossover'].includes(c.activityDesign))
        fail('Invalid activity design.');
    if (c.activityDesign === 'three_each' && c.questionsPerModality !== 3)
        fail('The three-each design requires three questions per modality.');
    if (!Array.isArray(c.languages) || c.languages.length < 1 || c.languages.some(l => !['python', 'java'].includes(l)))
        fail('Choose Python and/or Java.');
    if (!Array.isArray(c.sessions) || c.sessions.length !== 3 || [1, 2, 3].some(n => c.sessions.filter(s => s.number === n).length !== 1))
        fail('Configure sessions 1, 2 and 3 once each.');
    for (const s of c.sessions) {
        if (typeof s.open !== 'boolean' || typeof s.label !== 'string' || !s.label.trim())
            fail('Invalid session configuration.');
    }
    for (const k of Object.keys(defaultConfig.stages)) {
        if (typeof c.stages?.[k] !== 'boolean')
            fail('Each optional stage needs a true/false setting.');
    }
    for (const k of ['aiEnabled', 'executionEnabled', 'avoidRepeatedQuestions', 'backgroundFirstSessionOnly', 'includeAdditionalSurveyItems', 'preventDuplicateEntries'])
        if (typeof c[k] !== 'boolean')
            fail(`Invalid ${k}.`);
    for (const k of ['maxFeedbackPerQuestion', 'maxRunsPerQuestion'])
        if (!Number.isInteger(c[k]) || c[k] < 1 || c[k] > 100)
            fail(`Invalid ${k}.`);
    if (!Array.isArray(c.aiModalities) || c.aiModalities.some(m => !MODALITIES.includes(m)))
        fail('Invalid AI modalities.');
    if (!Array.isArray(c.feedbackTypes) || !c.feedbackTypes.length || c.feedbackTypes.some(t => !['hint', 'concept', 'debugging'].includes(t)))
        fail('Invalid feedback types.');
    if (!c.compensation || c.compensation.amount !== 20 || c.compensation.currency !== 'USD')
        fail('This deployment uses the supplied $20/session compensation plan. Changing it requires a versioned code/content update.');
    if (c.release?.status === 'approved') {
        if (c.release.reviewedContentHash !== contentHashForConfig(c))
            fail('Review and record the current questions, consent, instruments, and study configuration before live release.');
        if (typeof c.release.approvalReference !== 'string' || !c.release.approvalReference.trim())
            fail('Record the protocol review/approval reference first.');
        for (const k of Object.keys(defaultConfig.release.reviewed)) {
            if (c.release.reviewed[k] !== true)
                fail(`Complete the review item: ${k}.`);
        }
        if (c.deliveryMode === 'remote' && consent.version === 'supplied-main-consent-16317-v1')
            fail('Replace content/consent.json with the reviewed remote/e-consent document and a new version before live release. The supplied document describes in-person sessions.');
        if (c.stages.pre_test || c.stages.post_test) {
            if (JSON.stringify(assessments).includes('not supplied or validated'))
                fail('Replace illustrative assessments with the reviewed assessment bank before live release.');
        }
    }
    else if (c.release?.status !== 'draft')
        fail('Release status must be draft or approved.');
    return c;
}

export function canRunLive(c) {
    try {
        validateConfig(c);
        return c.release.status === 'approved';
    }
    catch {
        return false;
    }
}

// Remote self-enrollment is an operational deployment mode. It intentionally does not
// depend on release.status so participants can create their own credentials from the
// public Render deployment when the researcher has explicitly enabled live collection.
// Consent/version checks and the rest of the participant safeguards are enforced by the
// enrollment route itself.
export function canRunRemoteLiveStudy(c, liveSwitchEnabled = false, deploymentReady = true) {
    return Boolean(c && c.deliveryMode === 'remote' && liveSwitchEnabled && deploymentReady);
}

export function releaseBlockers(c, liveSwitchEnabled = false) {
    const blockers = [];
    if (c.release?.status !== 'approved') blockers.push('Study release status is still draft.');
    if (c.release?.reviewedContentHash !== contentHashForConfig(c)) blockers.push('The current questions, consent, instruments, and study configuration have not been recorded as reviewed.');
    if (!c.release?.approvalReference?.trim()) blockers.push('No protocol/content approval reference has been recorded.');
    for (const k of Object.keys(defaultConfig.release.reviewed)) {
        if (c.release?.reviewed?.[k] !== true) blockers.push(`Review item incomplete: ${k.replaceAll('_', ' ')}.`);
    }
    if (c.deliveryMode === 'remote' && consent.version === 'supplied-main-consent-16317-v1') blockers.push('The supplied consent describes in-person sessions and has not been replaced with a reviewed remote/e-consent version.');
    if (!liveSwitchEnabled) blockers.push('Render LIVE_COLLECTION_ENABLED is not set to true.');
    return blockers;
}

function surveyDefinition(phase, language, number, cfg) {
    const pre = phase === 'pre_survey';
    let items = [];
    if (pre && (!cfg.backgroundFirstSessionOnly || number === 1))
        items.push(...surveys.background);
    items.push(...surveys.selfEfficacy);
    if (!pre)
        items.push(...surveys.postSource);
    if (cfg.includeAdditionalSurveyItems)
        items.push(...(pre ? surveys.preExtras : surveys.postExtras));
    items = structuredClone(items).map(i => ({ ...i, label: language === 'java' ? i.label.replaceAll('Python', 'Java') : i.label, source: language === 'java' && i.label.includes('Python') ? `${i.source}; Java wording adaptation needs review` : i.source }));
    return { version: surveys.version + '-' + language + '-' + phase, items, prompt: pre ? surveys.prePrompt : surveys.postPrompt, scaleNote: surveys.scaleNote };
}

export function buildSnapshot(config, number, participantUuid) {
    const cfg = structuredClone(config);
    const session = cfg.sessions.find(x => x.number === number);
    if (!session)
        fail('Unknown session.');
    const bucket = parseInt(hashObject(participantUuid).slice(0, 8), 16) % 3;
    const rotation = (bucket + number - 1) % 3;
    const modalityOrder = [...MODALITIES.slice(rotation), ...MODALITIES.slice(0, rotation)];
    const stages = STAGES.map((key, ordinal) => {
        let d = { key, label: STAGE_LABELS[key], ordinal: ordinal + 1, enabled: Object.hasOwn(defaultConfig.stages, key) ? cfg.stages[key] !== false : true, version: 'workflow-4.0.0' };
        if (key === 'consent')
            d = { ...d, version: consent.version, document: consent, documentHash: hashObject(consent) };
        if (key === 'pre_survey' || key === 'post_survey')
            d = { ...d, version: surveys.version, variants: Object.fromEntries(['python', 'java'].map(l => [l, surveyDefinition(key, l, number, cfg)])) };
        if (key === 'pre_test' || key === 'post_test')
            d = { ...d, version: 'illustrative-assessment-v1', variants: Object.fromEntries(['python', 'java'].map(l => [l, structuredClone(assessments[l][String(number)][key])])) };
        return d;
    });
    return { snapshot: { config: cfg, contentHash: contentHashForConfig(cfg), questionBankHash, modalityOrder, stages }, stages };
}

export function assignmentCount(snapshot, modality) {
    return snapshot.config.activityDesign === 'assigned_crossover' ? (snapshot.modalityOrder[0] === modality ? 2 : 1) : 3;
}

export function bankCandidates(questions, snapshot, number, modality, usedIds = []) {
    const c = snapshot.config;
    const mapping = c.questionIdsBySession?.[String(number)]?.[questions[0]?.language]?.[modality];
    if (mapping !== undefined && !Array.isArray(mapping))
        fail('Invalid question mapping.', 503);
    return questions.filter(q => q.modality_id === modality && (!mapping || mapping.includes(q.id)) && (!c.avoidRepeatedQuestions || !usedIds.includes(q.id)));
}
