import { isOwnedStorageImage } from "@/lib/security/storage-image";
import { guardMutation } from "@/lib/security/mutation-request";
import { isBusinessMode } from "@/lib/business/business-mode";
import { NextResponse } from "next/server";
import { rateLimitResponse, reserveLimits } from "@/lib/security/rate-limit";

import { createPrismaClient } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { activeBusinessCookieOptions, ACTIVE_BUSINESS_COOKIE, findActiveMembership } from "@/lib/auth/active-business";

async function post(request: Request) {
  try {
    const prisma = createPrismaClient();
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "ავტორიზაცია საჭიროა.",
        },
        { status: 401 }
      );
    }

    const body = (await request.json()) as {
      mode?: unknown;
      name?: unknown;
      category?: unknown;
      logoUrl?: unknown;
    };

    if (!isBusinessMode(body.mode)) return NextResponse.json({error:"აირჩიე ბიზნესის მიმართულება."},{status:422});
    const mode=body.mode;

    const name =
      typeof body.name === "string" ? body.name.trim() : "";

    const category =
      typeof body.category === "string"
        ? body.category.trim()
        : "";

    const logoUrl =
      typeof body.logoUrl === "string"
        ? body.logoUrl.trim()
        : "";

    if (logoUrl && !isOwnedStorageImage(logoUrl, "business-logos", user.id)) {
      return NextResponse.json({ error: "ლოგოს მისამართი არასწორია. ატვირთეთ ფოტო ხელახლა." }, { status: 422 });
    }

    if (!name) {
      return NextResponse.json(
        {
          error: "ბიზნესის სახელი აუცილებელია.",
        },
        { status: 400 }
      );
    }

    if (!category) {
      return NextResponse.json(
        {
          error: "საქმიანობის სფერო აუცილებელია.",
        },
        { status: 400 }
      );
    }

    if (
      user.status !== "ACTIVE"
    ) {
      return NextResponse.json(
        {
          error: "ბიზნესის შექმნამდე საჭიროა ანგარიშის სრულად დადასტურება.",
        },
        { status: 403 }
      );
    }

    await reserveLimits(prisma, [{ scope: "business-create", identity: user.id, maximum: 10, seconds: 24 * 60 * 60 }]);

    // An additional business starts on the plan of the business the user is
    // working in now; the first business starts on FREE.
    const currentMembership = await findActiveMembership(prisma, user.id);
    const currentSubscription = currentMembership
      ? await prisma.subscription.findUnique({
          where: { businessId: currentMembership.businessId },
          select: { plan: true, status: true, expiresAt: true },
        })
      : null;
    const inheritsPlan =
      currentSubscription?.status === "ACTIVE" || currentSubscription?.status === "TRIALING";

    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name,
          category,
          mode,
          logoUrl: logoUrl || null,
        },
      });

      await tx.businessMembership.create({
        data: {
          userId: user.id,
          businessId: business.id,
          role: "OWNER",
        },
      });

      const subscription = await tx.subscription.create({
        data: {
          businessId: business.id,
          plan: inheritsPlan ? currentSubscription.plan : "FREE",
          status: inheritsPlan ? currentSubscription.status : "ACTIVE",
          expiresAt: inheritsPlan ? currentSubscription.expiresAt : null,
        },
      });

      return {
        business,
        subscription,
      };
    });

    const response = NextResponse.json(
      {
        message: "ბიზნესი წარმატებით შეიქმნა.",
        businessId: result.business.id,
        businessName: result.business.name,
        plan: result.subscription.plan,
        subscriptionStatus: result.subscription.status,
      },
      { status: 201 }
    );

    response.cookies.set(ACTIVE_BUSINESS_COOKIE, result.business.id, activeBusinessCookieOptions);

    return response;
  } catch (error) {
    const limited = rateLimitResponse(error);
    if (limited) return limited;
    console.error("Business onboarding error:", error);

    return NextResponse.json(
      {
        error: "ბიზნესის შექმნისას დაფიქსირდა შეცდომა.",
      },
      { status: 500 }
    );
  }
}
export const POST = guardMutation(post, "json");
