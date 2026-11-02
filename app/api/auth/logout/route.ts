import { guardMutation } from "@/lib/security/mutation-request";
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { cookies } from "next/headers";

import { createPrismaClient } from "@/lib/prisma";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/auth/active-business";

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function post() {
  let prisma: ReturnType<typeof createPrismaClient> | undefined;
  try {
    prisma = createPrismaClient();

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
    response.cookies.delete(ACTIVE_BUSINESS_COOKIE);

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
export const POST = guardMutation(post, "empty");
