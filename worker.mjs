// OpenNext's documented custom entrypoint keeps its generated fetch handler.
import openNextWorker from './.open-next/worker.js';
import manifest from './.next/static-csp.json';
import {createCspWorker} from './lib/security/create-csp-worker.mjs';
import {purgeExpiredSupportMessages} from './lib/support/purge-expired-support.mjs';
import {expireSubscriptions} from './lib/billing/expire-subscriptions.mjs';
import {pruneSystemLog, runJob} from './lib/system/job-runs.mjs';
export * from './.open-next/worker.js';

const worker = createCspWorker(openNextWorker, manifest);

const entry = {
    ...worker,
    // Hourly cron (wrangler.jsonc triggers): support chat history and photos live 24 hours,
    // and subscriptions past their end date get their status updated.
    async scheduled(_controller, env, ctx) {
        // Each task's last run and failures show on /admin/system.
        const url = env.HYPERDRIVE.connectionString;
        ctx.waitUntil(runJob(url, 'support-cleanup', () => purgeExpiredSupportMessages(url, env.SUPABASE_SECRET_KEY)));
        ctx.waitUntil(runJob(url, 'subscription-expiry', () => expireSubscriptions(url)));
        ctx.waitUntil(runJob(url, 'system-log-prune', () => pruneSystemLog(url)));
    },
};

export default entry;
