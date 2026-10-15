// Rubric version is a component of score reproducibility. Rules use only submitted explanation.
export const DETERMINISTIC_RUBRIC_VERSION = 'pb-explanation-criteria-v2.0.0';
const normalize = s => String(s || '').toLowerCase().replace(/[_\-]/g,' ').replace(/\s+/g,' ');
const matches = (s, parts) => parts.every(pattern => pattern.test(s));
const criterion = (label, ...parts) => ({label,parts});
const criteria = {
  '1C': [
    criterion('Explains absolute difference as distance independent of sign', /\babs\b|absolute|magnitude|math\s*\.\s*abs/, /non\s*negative|positive|sign|negative|distance|how far/),
    criterion('Explains the four difference thresholds', /zero|\b0\b|exact|perfect/, /\b2\b|two/, /\b5\b|five/, /close|adjust|match/, /else|otherwise|greater|more than|over|exceed/),
    criterion('Explains the first-matching branch and increasing thresholds', /order|first|before|sequence|priority|start/, /condition|branch|threshold|check|if/, /smaller|small|exact|zero|lower|narrow/, /greater|larger|higher|next|otherwise|else/),
    criterion('Explains comparisons for below, above, and equal', /below|less than|lower|under|</, /above|greater than|higher|over|>/, /equal|same|match|==/, /reading|temperature|measurement|input/, /target|reference/)
  ],
  '2C': [
    criterion('Explains rental cost from days multiplied by daily rate', /days|day|duration/, /rate|daily|price/, /multipli(?:ed|es|cation|y)|product|times|\*/),
    criterion('Explains ordered discount thresholds and one chosen discount', /discount/, /threshold|\b75\b|\b150\b|\b300\b|percent|15%|10%|5%/, /first|highest|one|only|order|if|branch/),
    criterion('Explains subtracting discount and adding insurance', /discount/, /subtract|minus|deduct|less|\-/, /insurance/, /add|plus|\+/),
    criterion('Explains final cost classification into low, moderate, or high', /final|total|cost/, /low/, /moderate|medium/, /high/, /condition|threshold|\b100\b|\b250\b|if/)
  ],
  '3C': [
    criterion('Explains retry when extended arm is not longer than standard arm', /extended|long/, /arm/, /less|short|equal|greater|longer|<=|not/, /again|retr(?:y|ies|ied)|re.enter|second|invalid/),
    criterion('Explains full reach using validated extended arm and attachment', /full|reach/, /extended|arm/, /tool|attachment|add|plus/, /valid|after|correct|retry|re.enter|update/),
    criterion('Explains choosing shortest sufficient arm first', /first|before|order|small|short/, /arm|reach/, /extended|full|tool/),
    criterion('Explains required nondecreasing reach relationship', /standard|arm|short/, /extended|long/, /full|tool|attachment/, /longer|greater|increase|<=|<|order/)
  ],
  '4C': [
    criterion('Explains Euclidean center distance from coordinate differences', /coordinate|\bx\b|\by\b|position/, /subtract|difference|delta|minus/, /square|sqrt|root|pythagor|distance/),
    criterion('Explains converting diameter to radius by dividing by two', /diameter/, /radius|radii/, /divide|half|\b2\b|two/),
    criterion('Explains subtracting radii to obtain distance between edges', /radius|radii/, /subtract|minus|deduct|remove/, /edge|surface|gap|effective|outside/),
    criterion('Explains checking shortest-range tool before longer options', /first|before|order|short|small/, /tool|grabber|scanner|range/, /long|extended|larger|next/)
  ],
  '5C': [
    criterion('Explains that both limits must hold for and', /\band\b|both/, /people|users|person/, /hour|duration|time/, /limit|condition|require|satisfy|within/),
    criterion('Explains ascending package checks', /small|basic|first|order|before/, /standard|extended|package|next|larger/),
    criterion('Explains that one failed conjunct rejects that package', /one|either|any|part/, /false|fail|exceed|not|too/, /and|condition|package|skip/),
    criterion('Explains else when no package meets the requirements', /else|otherwise|special|approval/, /none|no|exceed|not|fail|limit/)
  ],
  '6C': [
    criterion('Explains volume as length multiplied by width and height', /length/, /width/, /height/, /multip|times|product|\*/),
    criterion('Explains requiring both volume and weight limits', /volume/, /weight/, /both|and|each|simultaneous/, /limit|cap|threshold|within|less/),
    criterion('Explains checking smaller services before larger ones', /small|first|before|order|ascending|lowest/, /larg|next|greater|increase|higher|limit/),
    criterion('Explains special transport if none of the services qualifies', /special|transport/, /no|none|exceed|too|fail|beyond|greater|over/, /volume|weight|limit|service/)
  ]
};

export function gradeDeterministicExplanation({ question, modality, explanation }) {
  if (modality !== 'code-explanation') return null;
  const matched = /^PB-(?:PY|JA)-([1-6]C)$/.exec(question?.id || '');
  if (!matched) return null;
  const rubric = criteria[matched[1]];
  if (!rubric) return null;
  const s = normalize(explanation);
  const checks = rubric.map(c=>({ label:c.label, passed: matches(s,c.parts) }));
  const passed = checks.filter(c=>c.passed).length;
  return {
    score:passed * 25,
    summary:`${passed} of 4 explanation criteria demonstrated. Each criterion is worth 25 points. Address the unchecked requirements explicitly.`,
    checks,
    method:'deterministic-criterion-rubric', model:'rules-only',
    promptVersion:DETERMINISTIC_RUBRIC_VERSION,
    promptHash:DETERMINISTIC_RUBRIC_VERSION,
    responseId:null, usage:null, store:false
  };
}
