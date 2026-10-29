// OpenNext's documented custom entrypoint keeps its generated fetch handler.
import openNextWorker from './.open-next/worker.js';
import manifest from './.next/static-csp.json';
import {createCspWorker} from './lib/security/create-csp-worker.mjs';
import {purgeExpiredSupportMessages} from './lib/support/purge-expired-support.mjs';
export * from './.open-next/worker.js';

const worker = createCspWorker(openNextWorker, manifest);

const entry = {
    ...worker,
    // Hourly cron (wrangler.jsonc triggers): support chat history lives 24 hours.
    async scheduled(_controller, env, ctx) {
        ctx.waitUntil(purgeExpiredSupportMessages(env.HYPERDRIVE.connectionString)
            .catch(() => console.error('Support message cleanup failed')));
    },
};

export default entry;
