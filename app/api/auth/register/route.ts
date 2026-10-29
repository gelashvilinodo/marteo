import { guardMutation } from "@/lib/security/mutation-request";
import { NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import bcrypt from "bcryptjs";

import { createPrismaClient } from "@/lib/prisma";
import { normalizePhone, isAllowedSmsPhone } from "@/lib/security/phone";
import { reserveLimits, requestIp, rateLimitResponse } from "@/lib/security/rate-limit";
import { sendVerificationEmail } from "@/lib/email";
import { notifyPlatformAdmin } from "@/lib/push/web-push";

function hashVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function post(request: Request) {
  let prisma: ReturnType<typeof createPrismaClient> | undefined;
  try {
    prisma = createPrismaClient();

    const body = (await request.json()) as {
      firstName?: unknown;
      lastName?: unknown;
      email?: unknown;
      phone?: unknown;
      password?: unknown;
    };

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

    if (!isAllowedSmsPhone(phone)) {
      return NextResponse.json({ error: "მიუთითეთ მხარდაჭერილი მობილური ნომერი, მაგალითად +995599123456." }, { status: 422 });
    }
    await reserveLimits(prisma, [
      { scope: "register-ip", identity: requestIp(request), maximum: 10, seconds: 3600 },
    ]);

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

    // EMAIL verification-ისთვის ვქმნით 6-ნიშნა OTP კოდს.
    // PHONE OTP შეიქმნება მხოლოდ Email-ის წარმატებული დადასტურების შემდეგ.
    const emailCode = randomInt(100000, 1000000).toString();
    const emailCodeHash = hashVerificationToken(emailCode);

    const verificationExpiresAt = new Date(
      Date.now() + 10 * 60 * 1000
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
          token: emailCodeHash,
          expiresAt: verificationExpiresAt,
        },
      });

      return createdUser;
    });

    await notifyPlatformAdmin(prisma, {
      title: "ახალი მომხმარებელი",
      body: `${[user.firstName, user.lastName].filter(Boolean).join(" ") || "უსახელო"} · ${user.email}`,
      url: "/admin/users",
      tag: `new-user-${user.id}`,
    });

    await sendVerificationEmail({
      to: user.email,
      firstName: user.firstName ?? "",
      token: emailCode,
    });

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
    const limited = rateLimitResponse(error);
    if (limited) return limited;
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
  } finally {
      await prisma?.$disconnect();
  }
}

export const POST = guardMutation(post, "json");
