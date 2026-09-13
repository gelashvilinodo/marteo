import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

const SESSION_DURATION_DAYS = 30;

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

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

    if (!user) {
      return NextResponse.json(
        {
          error: "ელფოსტა ან პაროლი არასწორია.",
        },
        { status: 401 }
      );
    }

    const passwordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordValid) {
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
    console.error("Login error:", error);

    return NextResponse.json(
      {
        error: "სისტემაში შესვლისას დაფიქსირდა შეცდომა.",
      },
      { status: 500 }
    );
  }
}