import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

function hashVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string) {
  return phone.trim().replace(/\s+/g, "");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const firstName =
      typeof body.firstName === "string" ? body.firstName.trim() : "";

    const lastName =
      typeof body.lastName === "string" ? body.lastName.trim() : "";

    const email =
      typeof body.email === "string" ? normalizeEmail(body.email) : "";

    const phone =
      typeof body.phone === "string" ? normalizePhone(body.phone) : "";

    const password =
      typeof body.password === "string" ? body.password : "";

    if (!firstName || !lastName || !email || !phone || !password) {
      return NextResponse.json(
        {
          error: "ყველა სავალდებულო ველი უნდა შეავსოთ.",
        },
        { status: 400 }
      );
    }

    if (firstName.length > 100 || lastName.length > 100) {
      return NextResponse.json(
        {
          error: "სახელი ან გვარი ძალიან გრძელია.",
        },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          error: "ელფოსტის მისამართი არასწორია.",
        },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        {
          error: "პაროლი უნდა შეიცავდეს მინიმუმ 8 სიმბოლოს.",
        },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { phone }],
      },
      select: {
        email: true,
        phone: true,
      },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return NextResponse.json(
          {
            error: "ამ ელფოსტით ანგარიში უკვე არსებობს.",
          },
          { status: 409 }
        );
      }

      if (existingUser.phone === phone) {
        return NextResponse.json(
          {
            error: "ეს ტელეფონის ნომერი უკვე გამოყენებულია.",
          },
          { status: 409 }
        );
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // მხოლოდ EMAIL verification-ისთვის ვქმნით token-ს.
    // PHONE OTP ამ ეტაპზე ჯერ არ იქმნება.
    const emailToken = randomBytes(32).toString("hex");
    const emailTokenHash = hashVerificationToken(emailToken);

    const verificationExpiresAt = new Date(
      Date.now() + 15 * 60 * 1000
    );

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          firstName,
          lastName,
          email,
          phone,
          password: hashedPassword,
          status: "PENDING_VERIFICATION",
        },
      });

      await tx.verificationToken.create({
        data: {
          userId: createdUser.id,
          type: "EMAIL",
          token: emailTokenHash,
          expiresAt: verificationExpiresAt,
        },
      });

      return createdUser;
    });

    /*
     * TODO:
     * აქ მოგვიანებით დავამატებთ email provider-ს,
     * რომელიც მომხმარებელს რეალურად გაუგზავნის emailToken-ს.
     */

    return NextResponse.json(
      {
        message:
          "ანგარიში შეიქმნა. ელფოსტის დასადასტურებლად კოდი გამოგზავნილია.",
        userId: user.id,
        status: user.status,
      },
      { status: 201 }
    );
    } catch (error) {
    console.error("Registration error:", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      cause: error instanceof Error ? error.cause : undefined,
    });

    return NextResponse.json(
      {
        error: "რეგისტრაციისას დაფიქსირდა შეცდომა.",
      },
      { status: 500 }
    );
  }
}