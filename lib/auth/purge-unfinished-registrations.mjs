import pg from 'pg';

// Runs once a day from the Worker's cron. A registration left before the phone was verified
// keeps status PENDING_VERIFICATION; after 7 days it is removed so nothing lingers in the database.
// (Registering again with the same email or phone replaces such a record right away anyway.)
// Accounts with any business membership are never touched. Verification codes cascade with the user.
// Prisma DateTime columns are UTC "timestamp without time zone", hence the explicit UTC conversion.
/** @param {string} connectionString */
export async function purgeUnfinishedRegistrations(connectionString) {
    const client = new pg.Client({connectionString});
    await client.connect();
    try {
        const result = await client.query(`
            DELETE FROM "User" u
            WHERE u.status = 'PENDING_VERIFICATION'
              AND u."createdAt" < (now() AT TIME ZONE 'UTC') - interval '7 days'
              AND NOT EXISTS (SELECT 1 FROM "BusinessMembership" m WHERE m."userId" = u.id)
        `);
        return result.rowCount ?? 0;
    } finally {
        await client.end();
    }
}
