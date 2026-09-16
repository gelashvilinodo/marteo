import { NextResponse } from "next/server";
import { createHash } from "crypto";

import { createPrismaClient } from "@/lib/prisma";

function hashVerificationToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
    try {
        const prisma = createPrismaClient();

        const body = (await request.json()) as {
            userId?: string;
            code?: string;
        };

        const userId =
            typeof body.userId === "string" ? body.userId : "";

        const code =
            typeof body.code === "string" ? body.code : "";

        if (!userId || !/^\d{6}$/.test(code)) {
            return NextResponse.json(
                {
                    error: "კოდი არასწორია.",
                },
                { status: 400 }
            );
        }

        const tokenHash = hashVerificationToken(code);

        const verification =
            await prisma.verificationToken.findFirst({
                where: {
                    userId,
                    type: "EMAIL",
                    token: tokenHash,
                    usedAt: null,
                    expiresAt: {
                        gt: new Date(),
                    },
                },
            });

        if (!verification) {
            return NextResponse.json(
                {
                    error: "კოდი არასწორია ან ვადა გაუვიდა.",
                },
                { status: 400 }
            );
        }

        await prisma.$transaction(async (tx) => {
            await tx.verificationToken.update({
                where: {
                    id: verification.id,
                },
                data: {
                    usedAt: new Date(),
                },
            });

            await tx.user.update({
                where: {
                    id: userId,
                },
                data: {
                    emailVerifiedAt: new Date(),
                },
            });
        });

        return NextResponse.json({
            status: "success",
        });
    } catch (error) {
        console.error(error);

        return NextResponse.json(
            {
                error: "ტექნიკური შეცდომა.",
            },
            { status: 500 }
        );
    }
}