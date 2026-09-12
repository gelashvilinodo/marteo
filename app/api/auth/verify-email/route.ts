import { NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";

import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

function hashVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const userId =
      typeof body.userId === "string" ? body.userId.trim() : "";

    const token =
      typeof body.token === "string" ? body.token.trim() : "";

    if (!userId || !token) {
      return NextResponse.json(
        {
          error: "ვერიფიკაციის მონაცემები არასრულია.",
        },
        { status: 400 }
      );
    }

    const tokenHash = hashVerificationToken(token);

    const verificationToken = await prisma.verificationToken.findFirst({
      where: {
        userId,
        type: "EMAIL",
        token: tokenHash,
        usedAt: null,
      },
    });

    if (!verificationToken) {
      return NextResponse.json(
        {
          error: "ვერიფიკაციის კოდი არასწორია ან უკვე გამოყენებულია.",
        },
        { status: 400 }
      );
    }

    if (verificationToken.expiresAt < new Date()) {
      return NextResponse.json(
        {
          error: "ვერიფიკაციის კოდს ვადა გაუვიდა.",
        },
        { status: 400 }
      );
    }

    const phoneCode = randomInt(100000, 1000000).toString();
    const phoneCodeHash = hashVerificationToken(phoneCode);

    const phoneCodeExpiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    );

    const user = await prisma.$transaction(async (tx) => {
      await tx.verificationToken.update({
        where: {
          id: verificationToken.id,
        },
        data: {
          usedAt: new Date(),
        },
      });

      const updatedUser = await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          emailVerifiedAt: new Date(),
        },
        select: {
          id: true,
          phone: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          status: true,
        },
      });

      await tx.verificationToken.deleteMany({
        where: {
          userId,
          type: "PHONE",
          usedAt: null,
        },
      });

      await tx.verificationToken.create({
        data: {
          userId,
          type: "PHONE",
          token: phoneCodeHash,
          expiresAt: phoneCodeExpiresAt,
        },
      });

      return updatedUser;
    });

    await sendSms({
      phone: user.phone,
      message: `MARTEO: თქვენი ტელეფონის დასადასტურებელი კოდია ${phoneCode}`,
    });

    return NextResponse.json(
      {
        message:
          "ელფოსტა წარმატებით დადასტურდა. ტელეფონის დასადასტურებელი კოდი გამოგზავნილია.",
        userId: user.id,
        emailVerified: Boolean(user.emailVerifiedAt),
        phoneVerified: Boolean(user.phoneVerifiedAt),
        status: user.status,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Email verification error:", error);

    return NextResponse.json(
      {
        error: "ელფოსტის ვერიფიკაციისას დაფიქსირდა შეცდომა.",
      },
      { status: 500 }
    );
  }
}