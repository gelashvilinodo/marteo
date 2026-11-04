import pg from 'pg';
import {insertSystemError} from './system-errors.mjs';

// Wraps one cron task: its last run, result and failure show on /admin/system,
// and a failure also lands in the error log. Never throws, so one task cannot stop another.
/**
 * @param {string} connectionString
 * @param {string} name
 * @param {() => Promise<number | void>} task
 */
export async function runJob(connectionString, name, task) {
    const client = new pg.Client({connectionString});
    await client.connect();
    try {
        await client.query(`
            INSERT INTO "SystemJob" (name, "lastStartedAt", runs) VALUES ($1, now() AT TIME ZONE 'UTC', 1)
            ON CONFLICT (name) DO UPDATE SET "lastStartedAt" = now() AT TIME ZONE 'UTC', runs = "SystemJob".runs + 1
        `, [name]);
        try {
            const result = await task();
            await client.query(`
                UPDATE "SystemJob" SET "lastFinishedAt" = now() AT TIME ZONE 'UTC', "lastOk" = true, "lastError" = NULL, "lastResult" = $2 WHERE name = $1
            `, [name, typeof result === 'number' ? result : null]);
        } catch (error) {
            const reason = error instanceof Error ? error.name : 'UnknownError';
            await client.query(`
                UPDATE "SystemJob" SET "lastFinishedAt" = now() AT TIME ZONE 'UTC', "lastOk" = false, "lastError" = $2, failures = failures + 1 WHERE name = $1
            `, [name, reason]);
            await insertSystemError(client, {source: 'cron', message: `${name} failed: ${reason}`, route: name});
        }
    } catch {
        console.error(`Cron job ${name} could not be recorded`);
    } finally {
        await client.end().catch(() => undefined);
    }
}

// Resolved errors older than 90 days and ended banners are no longer useful.
/** @param {string} connectionString */
export async function pruneSystemLog(connectionString) {
    const client = new pg.Client({connectionString});
    await client.connect();
    try {
        const errors = await client.query(`DELETE FROM "SystemError" WHERE "resolvedAt" IS NOT NULL AND "lastAt" < (now() AT TIME ZONE 'UTC') - interval '90 days'`);
        const banners = await client.query(`DELETE FROM "SystemBanner" WHERE coalesce("canceledAt", "endsAt") < (now() AT TIME ZONE 'UTC') - interval '90 days'`);
        return (errors.rowCount ?? 0) + (banners.rowCount ?? 0);
    } finally {
        await client.end();
    }
}
