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

// მომხმარებლის SMS (შეკვეთა გაიგზავნა): ერთ ნომერზე საათში რამდენიმე, მთელ სისტემაზე დღიური ზღვარი.
export async function reserveOrderSms(recipient: string) {
    const prisma = createPrismaClient();
    try {
        await reserveLimits(prisma, [
            { scope: "order-sms-recipient-hour", identity: recipient, maximum: 5, seconds: 3600 },
            { scope: "order-sms-global-day", identity: "all", maximum: dailyCap("ORDER_SMS_DAILY_LIMIT", 5000), seconds: 86400 },
        ]);
    } finally { await prisma.$disconnect(); }
}
