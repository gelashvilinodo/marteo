import "server-only";
import { createPrismaClient } from "@/lib/prisma";
import { reserveLimits } from "./rate-limit";

function dailyCap(name: string, fallback: number) {
    const value = process.env[name];
    if (!value) return fallback;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("Invalid delivery budget configuration");
    return Number(value);
}
// Reserve BEFORE contacting a provider; an uncertain delivery never refunds quota.
export async function reserveDelivery(channel: "sms" | "email", recipient: string) {
    const prisma = createPrismaClient();
    try {
        await reserveLimits(prisma, [
            { scope: `${channel}-cooldown`, identity: recipient, maximum: 1, seconds: 60 },
            { scope: `${channel}-recipient-hour`, identity: recipient, maximum: channel === "sms" ? 3 : 6, seconds: 3600 },
            { scope: `${channel}-global-day`, identity: "all", maximum: channel === "sms" ? dailyCap("SMS_DAILY_SEND_LIMIT",100) : dailyCap("EMAIL_DAILY_SEND_LIMIT",500), seconds: 86400 },
        ]);
    } finally { await prisma.$disconnect(); }
}
