import { guardMutation } from "@/lib/security/mutation-request";
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";

import { createPrismaClient } from "@/lib/prisma";

import { reserveLimits, requestIp, rateLimitResponse } from "@/lib/security/rate-limit";

const SESSION_DURATION_DAYS = 30;
// Match registration's bcrypt cost even when an account does not exist.
const DUMMY_PASSWORD_HASH = "$2b$12$mcKp3BjwNCDbYmxmx/w/CuwumeMqzXCsU3YgwFrypd92wS98D2AEW";

function hashSessionToken(token: string) {
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
      email?: unknown;
      password?: unknown;
    };

    const email =
      typeof body.email === "string" ? normalizeEmail(body.email) : "";

    const password =
      typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        {
          error: "ელფოსტა და პაროლი აუცილებელია.",
        },
        { status: 400 }
      );
    }

    await reserveLimits(prisma, [
      { scope: "login-ip", identity: requestIp(request), maximum: 60, seconds: 600 },
      { scope: "login-account", identity: email, maximum: 20, seconds: 600 },
      { scope: "login-pair", identity: `${requestIp(request)}:${email}`, maximum: 5, seconds: 60 },
    ]);

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        email: true,
        password: true,
        status: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
      },
    });

    const passwordValid = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_PASSWORD_HASH
    );

    if (!user || !passwordValid) {
      return NextResponse.json(
        {
          error: "ელფოსტა ან პაროლი არასწორია.",
        },
        { status: 401 }
      );
    }

    if (
      user.status !== "ACTIVE" ||
      !user.emailVerifiedAt ||
      !user.phoneVerifiedAt
    ) {
      return NextResponse.json(
        {
          error: "ანგარიშის გამოყენებამდე საჭიროა ელფოსტისა და ტელეფონის დადასტურება.",
        },
        { status: 403 }
      );
    }

    const sessionToken = randomBytes(32).toString("hex");
    const tokenHash = hashSessionToken(sessionToken);

    const expiresAt = new Date(
      Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
    );

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const response = NextResponse.json(
      {
        message: "წარმატებით შეხვედით ანგარიშში.",
        userId: user.id,
      },
      { status: 200 }
    );

    response.cookies.set("marteo_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    });

    return response;
  } catch (error) {
    const limited = rateLimitResponse(error);
    if (limited) return limited;
    console.error("Login error:", error);

    return NextResponse.json(
      {
        error: "სისტემაში შესვლისას დაფიქსირდა შეცდომა.",
      },
      { status: 500 }
    );
  } finally {
      await prisma?.$disconnect();
  }
}
export const POST = guardMutation(post, "json");
