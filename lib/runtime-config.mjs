function exactBase64Bytes(value, expectedBytes) {
  if (typeof value !== 'string' || !value.length || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    const decoded = Buffer.from(value, 'base64');
    return decoded.length === expectedBytes && decoded.toString('base64') === value;
  } catch {
    return false;
  }
}

function parseUrl(value, { httpsInProduction = false, rootOnly = false, production = false } = {}) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (httpsInProduction && production && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.hash || url.search) return null;
    if (rootOnly && url.pathname !== '/') return null;
    return url;
  } catch {
    return null;
  }
}

export function resolvePort(value) {
  if (value == null || value === '') return 3000;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : 3000;
}

export function runtimeIssues(env = process.env) {
  const issues = [];
  const production = env.NODE_ENV === 'production';

  if (!env.SUPABASE_URL) issues.push('SUPABASE_URL is missing');
  else if (!parseUrl(env.SUPABASE_URL, { httpsInProduction: true, rootOnly: true, production })) issues.push('SUPABASE_URL must be a valid root URL and use https in production');

  if (!env.SUPABASE_SECRET_KEY) issues.push('SUPABASE_SECRET_KEY is missing');
  if (env.SUPABASE_SECRET_KEY?.startsWith('sb_publishable_')) issues.push('SUPABASE_SECRET_KEY is a publishable key; use a server-side secret/service_role key');
  if (env.SUPABASE_SECRET_KEY?.startsWith('eyJ')) {
    try {
      const claims = JSON.parse(Buffer.from(env.SUPABASE_SECRET_KEY.split('.')[1], 'base64url').toString());
      if (claims.role !== 'service_role') issues.push('SUPABASE_SECRET_KEY JWT is not a service_role key');
    } catch {
      issues.push('SUPABASE_SECRET_KEY looks like a malformed legacy JWT');
    }
  }

  if (!exactBase64Bytes(env.PII_ENCRYPTION_KEY || '', 32)) issues.push('PII_ENCRYPTION_KEY must be canonical base64 for exactly 32 random bytes');
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) issues.push('ADMIN_TOKEN must be at least 32 characters');
  if (!env.COMPENSATION_ADMIN_TOKEN || env.COMPENSATION_ADMIN_TOKEN.length < 32) issues.push('COMPENSATION_ADMIN_TOKEN must be at least 32 characters');
  if (env.ADMIN_TOKEN && env.COMPENSATION_ADMIN_TOKEN && env.ADMIN_TOKEN === env.COMPENSATION_ADMIN_TOKEN) issues.push('ADMIN_TOKEN and COMPENSATION_ADMIN_TOKEN must be different');

  if (!env.OPENAI_API_KEY) issues.push('OPENAI_API_KEY is missing; AI scoring is required by this study build');
  if (!env.OPENAI_MODEL) issues.push('OPENAI_MODEL is missing; AI scoring is required by this study build');
  for (const key of ['OPENAI_MAX_CONCURRENCY', 'JUDGE0_MAX_CONCURRENCY']) {
    if (env[key] != null && env[key] !== '') {
      const n = Number(env[key]);
      if (!Number.isInteger(n) || n < 1 || n > 200) issues.push(`${key} must be an integer from 1 to 200`);
    }
  }

  if ((env.EXECUTION_PROVIDER || 'judge0').toLowerCase() !== 'judge0') issues.push('EXECUTION_PROVIDER must be judge0 for this study build');
  if (!parseUrl(env.JUDGE0_URL || 'https://ce.judge0.com', { httpsInProduction: true, production })) issues.push('JUDGE0_URL must be a valid URL and use https in production');
  if (env.LIVE_COLLECTION_ENABLED != null && !['true', 'false'].includes(env.LIVE_COLLECTION_ENABLED)) issues.push('LIVE_COLLECTION_ENABLED must be true or false');

  if (env.PORT != null && env.PORT !== '') {
    const n = Number(env.PORT);
    if (!Number.isInteger(n) || n < 1 || n > 65535) issues.push('PORT must be an integer from 1 to 65535');
  }

  if (production) {
    if (!env.PUBLIC_ORIGIN) issues.push('PUBLIC_ORIGIN is missing');
    else {
      const url = parseUrl(env.PUBLIC_ORIGIN, { httpsInProduction: true, rootOnly: true, production: true });
      if (!url) issues.push('PUBLIC_ORIGIN must be a valid https origin without a path, query, credentials, or fragment');
    }
  }
  return issues;
}
