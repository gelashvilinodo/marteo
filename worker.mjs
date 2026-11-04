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
    // subscriptions past their end date get their status updated, then plan reminders go out.
    async scheduled(_controller, env, ctx) {
        // Each task's last run and failures show on /admin/system.
        const url = env.HYPERDRIVE.connectionString;
        ctx.waitUntil(runJob(url, 'support-cleanup', () => purgeExpiredSupportMessages(url, env.SUPABASE_SECRET_KEY)));
        // ჯერ ვადის სტატუსები, მერე გეგმის შეხსენებები და მეილი/პუში (Next-ის დაცული როუტით, CRON_SECRET-ით).
        ctx.waitUntil(runJob(url, 'subscription-expiry', () => expireSubscriptions(url)).then(() => runJob(url, 'subscription-notices', async () => {
            if (!env.CRON_SECRET) throw new Error('CRON_SECRET is not configured');
            const response = await entry.fetch(new Request(`${env.APP_URL}/api/cron/subscription-notices`, {
                method: 'POST', headers: {authorization: `Bearer ${env.CRON_SECRET}`},
            }), env, ctx);
            if (!response.ok) throw new Error(`Subscription notices HTTP ${response.status}`);
            return (await response.json()).sent;
        })));
        ctx.waitUntil(runJob(url, 'system-log-prune', () => pruneSystemLog(url)));
    },
};

export default entry;
