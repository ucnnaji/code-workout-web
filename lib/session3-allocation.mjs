// Deterministic Session 3 R3 family assignment. The entire four-question plan
// is calculated at once so that later crossover stages cannot expose a near-
// duplicate algorithm from an earlier question. No participant response data
// or external services are used by this allocation.
import { deterministicPick, fail } from './core.mjs';

export function isSession3R3(snapshot, sessionNumber = 3) {
    return sessionNumber === 3 && snapshot?.config?.session3R3Allocation === 'distinct-families-v1';
}

export function session3QuestionPlan(bank, snapshot, seed, language, usedIds = []) {
    if (!isSession3R3(snapshot, 3)) fail('The requested snapshot does not specify the Session 3 R3 allocation.');
    const orderedModalities = snapshot.modalityOrder;
    const byId = new Map(bank.filter(q => q.language === language && q.question_set_version === 'PB3-R3' && q.active !== false).map(q => [q.id,q]));
    const used = new Set(usedIds);
    const families = [...new Set([...byId.values()].map(q => q.family))].sort();
    if (families.length < 4) fail('The Session 3 release has too few distinct families.', 503);
    const familyChoices = deterministicPick(families, seed, `PB3-R3|${language}|family-plan`, 4);
    const slots = [orderedModalities[0],orderedModalities[0],orderedModalities[1],orderedModalities[2]];
    const plan = { 'problem-solving':[], debugging:[], 'code-explanation':[] };
    familyChoices.forEach((family, index) => {
        const modality = slots[index];
        const matches = [...byId.values()].filter(q => q.family === family && q.modality_id === modality && !used.has(q.id));
        if (!matches.length) fail(`Session 3 question family ${family} has no available ${modality} question.`, 503);
        const id = deterministicPick(matches.map(q => q.id), seed, `PB3-R3|${language}|${family}|${modality}|variant`, 1)[0];
        plan[modality].push(id);
    });
    const all = Object.values(plan).flat();
    if (all.length !== 4 || new Set(all).size !== 4 || new Set(all.map(id => byId.get(id).family)).size !== 4)
        fail('Session 3 allocation could not ensure distinct families.', 503);
    return plan;
}
