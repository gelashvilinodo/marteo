import pg from 'pg';

// Runs from the Worker's hourly cron. Requests also purge on read, but without
// traffic expired messages would otherwise stay stored. Prisma DateTime columns
// are UTC "timestamp without time zone", hence the explicit UTC conversion.
/** @param {string} connectionString */
export async function purgeExpiredSupportMessages(connectionString) {
    const client = new pg.Client({connectionString});
    await client.connect();
    try {
        const result = await client.query(`DELETE FROM "SupportMessage" WHERE "createdAt" < (now() AT TIME ZONE 'UTC') - interval '24 hours'`);
        return result.rowCount ?? 0;
    } finally {
        await client.end();
    }
}
