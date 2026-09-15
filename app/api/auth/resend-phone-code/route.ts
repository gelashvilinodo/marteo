import { NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";

import { createPrismaClient } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

function hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
    try {
        const prisma = createPrismaClient();

        const body = (await request.json()) as {
            userId?: string;
        };

        if (!body.userId) {
            return NextResponse.json(
                { error: "userId is required." },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: {
                id: body.userId,
            },
            select: {
                id: true,
                phone: true,
                emailVerifiedAt: true,
            },
        });

        if (!user) {
            return NextResponse.json(
                { error: "User not found." },
                { status: 404 }
            );
        }

        if (!user.emailVerifiedAt) {
            return NextResponse.json(
                { error: "Email is not verified." },
                { status: 400 }
            );
        }

        const code = randomInt(100000, 1000000).toString();

        await prisma.verificationToken.deleteMany({
            where: {
                userId: user.id,
                type: "PHONE",
                usedAt: null,
            },
        });

        await prisma.verificationToken.create({
            data: {
                userId: user.id,
                type: "PHONE",
                token: hashToken(code),
                expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            },
        });

        await sendSms({
            phone: user.phone,
            message: `MARTEO: თქვენი ტელეფონის დასადასტურებელი კოდია ${code}`,
        });

        return NextResponse.json({
            success: true,
        });
    } catch {
        return NextResponse.json(
            {
                error: "SMS ვერ გაიგზავნა.",
            },
            {
                status: 500,
            }
        );
    }
}