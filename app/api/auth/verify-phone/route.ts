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
      userId?: unknown;
      code?: unknown;
    };

    const userId =
      typeof body.userId === "string" ? body.userId.trim() : "";

    const code =
      typeof body.code === "string" ? body.code.trim() : "";

    if (!userId || !code) {
      return NextResponse.json(
        {
          error: "ვერიფიკაციის მონაცემები არასრულია.",
        },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        {
          error: "ტელეფონის კოდი უნდა შეიცავდეს 6 ციფრს.",
        },
        { status: 400 }
      );
    }

    const verificationToken = await prisma.verificationToken.findFirst({
      where: {
        userId,
        type: "PHONE",
        token: hashVerificationToken(code),
        usedAt: null,
      },
    });

    if (!verificationToken) {
      return NextResponse.json(
        {
          error: "ტელეფონის კოდი არასწორია ან უკვე გამოყენებულია.",
        },
        { status: 400 }
      );
    }

    if (verificationToken.expiresAt < new Date()) {
      return NextResponse.json(
        {
          error: "ტელეფონის კოდს ვადა გაუვიდა.",
        },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        status: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          error: "მომხმარებელი ვერ მოიძებნა.",
        },
        { status: 404 }
      );
    }

    if (!user.emailVerifiedAt) {
      return NextResponse.json(
        {
          error: "ტელეფონის დადასტურებამდე საჭიროა ელფოსტის დადასტურება.",
        },
        { status: 400 }
      );
    }

    const verifiedUser = await prisma.$transaction(async (tx) => {
      await tx.verificationToken.update({
        where: {
          id: verificationToken.id,
        },
        data: {
          usedAt: new Date(),
        },
      });

      return tx.user.update({
        where: {
          id: userId,
        },
        data: {
          phoneVerifiedAt: new Date(),
          status: "ACTIVE",
        },
        select: {
          id: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          status: true,
        },
      });
    });

    return NextResponse.json(
      {
        message:
          "ტელეფონი წარმატებით დადასტურდა. თქვენი ანგარიში აქტიურია.",
        userId: verifiedUser.id,
        emailVerified: Boolean(verifiedUser.emailVerifiedAt),
        phoneVerified: Boolean(verifiedUser.phoneVerifiedAt),
        status: verifiedUser.status,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Phone verification error:", error);

    return NextResponse.json(
      {
        error: "ტელეფონის ვერიფიკაციისას დაფიქსირდა შეცდომა.",
      },
      { status: 500 }
    );
  }
}