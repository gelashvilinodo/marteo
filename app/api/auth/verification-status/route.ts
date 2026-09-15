import { NextResponse } from "next/server";

import { createPrismaClient } from "@/lib/prisma";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    const userId = searchParams.get("userId");

    if (!userId) {
        return NextResponse.json(
            { error: "userId is required." },
            { status: 400 }
        );
    }

    const prisma = createPrismaClient();

    const user = await prisma.user.findUnique({
        where: {
            id: userId,
        },
        select: {
            emailVerifiedAt: true,
            phoneVerifiedAt: true,
            status: true,
        },
    });

    if (!user) {
        return NextResponse.json(
            { error: "User not found." },
            { status: 404 }
        );
    }

    return NextResponse.json({
        emailVerified: Boolean(user.emailVerifiedAt),
        phoneVerified: Boolean(user.phoneVerifiedAt),
        status: user.status,
    });
}