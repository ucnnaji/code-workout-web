import { AppError } from './core.mjs';

function keyProblem(key) {
    if (!key) return 'SUPABASE_SECRET_KEY is not configured.';
    if (key.startsWith('sb_publishable_')) return 'SUPABASE_SECRET_KEY must be a server-side Supabase secret/service_role key.';
    if (key.startsWith('eyJ')) {
        try {
            const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
            if (claims.role !== 'service_role') return 'SUPABASE_SECRET_KEY is not a service_role key.';
        }
        catch { return 'SUPABASE_SECRET_KEY is not a valid legacy service_role JWT.'; }
    }
    return null;
}

// Fetch instead of a browser Supabase client: secrets never enter frontend code.
export class Database {
    constructor(url, key) {
        this.url = typeof url === 'string' ? url.replace(/\/$/, '') : '';
        this.key = typeof key === 'string' ? key : '';
    }
    configurationIssue() {
        if (!this.url) return 'SUPABASE_URL is not configured.';
        try { new URL(this.url); } catch { return 'SUPABASE_URL is invalid.'; }
        return keyProblem(this.key);
    }
    async call(action, p = {}) {
        const issue = this.configurationIssue();
        if (issue) throw new AppError(`Database setup incomplete: ${issue}`, 503);
        let response;
        try {
            response = await fetch(`${this.url}/rest/v1/rpc/cw_rpc`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: this.key,
                    ...(this.key.startsWith('eyJ') ? { Authorization: `Bearer ${this.key}` } : {})
                },
                body: JSON.stringify({ action, p }),
                signal: AbortSignal.timeout(15000)
            });
        }
        catch {
            throw new AppError('Database connection unavailable. Your unsaved work is still in this tab.', 503);
        }
        const raw = await response.text();
        let data;
        try { data = raw ? JSON.parse(raw) : null; }
        catch { throw new AppError('Unexpected database response.', 503); }
        if (!response.ok) {
            const m = data?.message || 'Database operation failed.';
            const matched = m.match(/^(CONFLICT|NOT_FOUND|FORBIDDEN|INVALID|LIMIT):\s*(.*)/);
            if (matched)
                throw new AppError(matched[2], { CONFLICT: 409, NOT_FOUND: 404, FORBIDDEN: 403, INVALID: 400, LIMIT: 429 }[matched[1]]);
            const code = data?.code || null;
            console.error(JSON.stringify({ event: 'database_error', action, code }));
            if (code === 'PGRST202' || /cw_rpc/i.test(m))
                throw new AppError('Supabase workflow migration is not installed yet. Run supabase_upgrade.sql, then retry.', 503);
            throw new AppError('Database operation failed. Check the workflow migration and server-side Supabase key.', 503);
        }
        return data;
    }
}
