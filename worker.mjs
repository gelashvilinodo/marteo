// OpenNext's documented custom entrypoint keeps its generated fetch handler.
import openNextWorker from './.open-next/worker.js';
import manifest from './.next/static-csp.json';
import {createCspWorker} from './lib/security/create-csp-worker.mjs';
import {purgeExpiredSupportMessages} from './lib/support/purge-expired-support.mjs';
import {expireSubscriptions} from './lib/billing/expire-subscriptions.mjs';
import {pruneSystemLog, runJob} from './lib/system/job-runs.mjs';
import {sweepUnusedImages} from './lib/storage/sweep-unused-images.mjs';
import {purgeUnfinishedRegistrations} from './lib/auth/purge-unfinished-registrations.mjs';
export * from './.open-next/worker.js';

const worker = createCspWorker(openNextWorker, manifest);

const entry = {
    ...worker,
    // www.marteo.ge is the same site: send it to the one canonical host with a permanent redirect.
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.hostname.startsWith('www.')) {
            url.hostname = url.hostname.slice(4);
            return Response.redirect(url.toString(), 301);
        }
        return worker.fetch(request, env, ctx);
    },
    // Cron every 5 minutes (wrangler.jsonc triggers): unanswered bank payments are re-checked each time.
    // At minute 0 the hourly tasks run: support chat history and photos live 24 hours,
    // subscriptions past their end date get their status updated, then plan reminders go out.
    async scheduled(controller, env, ctx) {
        // Each task's last run and failures show on /admin/system.
        const url = env.HYPERDRIVE.connectionString;
        // ბანკის callback თუ დაიკარგა, გეგმა მაქსიმუმ ~5 წუთში მაინც ჩაირთოს.
        ctx.waitUntil(runJob(url, 'bank-sync', async () => {
            if (!env.CRON_SECRET) throw new Error('CRON_SECRET is not configured');
            const response = await entry.fetch(new Request(`${env.APP_URL}/api/cron/bank-sync`, {
                method: 'POST', headers: {authorization: `Bearer ${env.CRON_SECRET}`},
            }), env, ctx);
            if (!response.ok) throw new Error(`Bank sync HTTP ${response.status}`);
            return (await response.json()).synced;
        }));
        if (new Date(controller.scheduledTime).getUTCMinutes() !== 0) return;
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
        // ადმინს ერთი push: წინა საათის ახალი შეცდომები, ჩავარდნილი სამუშაოები და გაჭედილი გადახდები.
        ctx.waitUntil(runJob(url, 'admin-alerts', async () => {
            if (!env.CRON_SECRET) throw new Error('CRON_SECRET is not configured');
            const response = await entry.fetch(new Request(`${env.APP_URL}/api/cron/admin-alerts`, {
                method: 'POST', headers: {authorization: `Bearer ${env.CRON_SECRET}`},
            }), env, ctx);
            if (!response.ok) throw new Error(`Admin alerts HTTP ${response.status}`);
            return (await response.json()).sent;
        }));
        // Mondays 06:00–08:00 UTC (10:00–12:00 Tbilisi): Marteo AI weekly digest, once per owner and business.
        // Later hours only retry what failed; the chat id is fixed per week, so nothing is sent twice.
        const scheduled = new Date(controller.scheduledTime);
        if (scheduled.getUTCDay() === 1 && scheduled.getUTCHours() >= 6 && scheduled.getUTCHours() <= 8) {
            ctx.waitUntil(runJob(url, 'ai-weekly-digest', async () => {
                if (!env.CRON_SECRET) throw new Error('CRON_SECRET is not configured');
                const response = await entry.fetch(new Request(`${env.APP_URL}/api/cron/ai-weekly-digest`, {
                    method: 'POST', headers: {authorization: `Bearer ${env.CRON_SECRET}`},
                }), env, ctx);
                if (!response.ok) throw new Error(`AI weekly digest HTTP ${response.status}`);
                return (await response.json()).sent;
            }));
        }
        // Once a day, at 06:00 UTC (10:00 Tbilisi): one push per business about orders still not completed 7+ days after creation.
        if (new Date(controller.scheduledTime).getUTCHours() === 6) {
            ctx.waitUntil(runJob(url, 'stale-order-push', async () => {
                if (!env.CRON_SECRET) throw new Error('CRON_SECRET is not configured');
                const response = await entry.fetch(new Request(`${env.APP_URL}/api/cron/stale-orders`, {
                    method: 'POST', headers: {authorization: `Bearer ${env.CRON_SECRET}`},
                }), env, ctx);
                if (!response.ok) throw new Error(`Stale order push HTTP ${response.status}`);
                return (await response.json()).sent;
            }));
        }
        // Once a day, at 03:00 UTC: photos in storage that no database row mentions.
        if (new Date(controller.scheduledTime).getUTCHours() === 3) {
            ctx.waitUntil(runJob(url, 'unused-image-cleanup', () => sweepUnusedImages(url, env.SUPABASE_SECRET_KEY)));
            // 7 დღეზე ძველი დაუსრულებელი რეგისტრაციები (ვერიფიკაციის შუაში დატოვებული).
            ctx.waitUntil(runJob(url, 'unfinished-registration-cleanup', () => purgeUnfinishedRegistrations(url)));
        }
    },
};

export default entry;
