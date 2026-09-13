import { Database } from './lib/database.mjs';
import { createApp } from './lib/app.mjs';
import { runtimeIssues, resolvePort } from './lib/runtime-config.mjs';

const issues = runtimeIssues();
for (const issue of issues) console.warn(`[startup configuration] ${issue}`);

const db = new Database(process.env.SUPABASE_URL || '', process.env.SUPABASE_SECRET_KEY || '');
const app = createApp({ db, startupIssues: issues });
const port = resolvePort(process.env.PORT);
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Code Workout web service listening on port ${port}.`);
  if (issues.length) console.warn('Service is live but setup is incomplete. Open /health or /readyz for diagnostics.');
});
server.requestTimeout = 120000;
server.headersTimeout = 15000;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 65000).unref(); });