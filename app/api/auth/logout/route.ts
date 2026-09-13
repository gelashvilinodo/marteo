import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("marteo_session")?.value;

    if (sessionToken) {
      const tokenHash = hashSessionToken(sessionToken);

      await prisma.session.deleteMany({
        where: {
          tokenHash,
        },
      });
    }

    const response = NextResponse.json(
      {
        message: "წარმატებით გამოხვედით ანგარიშიდან.",
      },
      { status: 200 }
    );

    response.cookies.delete("marteo_session");

    return response;
  } catch (error) {
    console.error("Logout error:", error);

    return NextResponse.json(
      {
        error: "ანგარიშიდან გამოსვლისას დაფიქსირდა შეცდომა.",
      },
      { status: 500 }
    );
  }
}