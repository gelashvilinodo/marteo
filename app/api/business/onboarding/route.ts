import { NextResponse } from "next/server";

import { createPrismaClient } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";

export async function POST(request: Request) {
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
      name?: unknown;
      category?: unknown;
      logoUrl?: unknown;
    };

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
          error: "ბიზნესის ტიპი აუცილებელია.",
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

    const existingMembership = await prisma.businessMembership.findFirst({
      where: {
        userId: user.id,
        role: "OWNER",
      },
    });

    if (existingMembership) {
      return NextResponse.json(
        {
          error: "თქვენ უკვე გაქვთ შექმნილი ბიზნესი.",
        },
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name,
          category,
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
          plan: "FREE",
          status: "ACTIVE",
        },
      });

      return {
        business,
        subscription,
      };
    });

    return NextResponse.json(
      {
        message: "ბიზნესი წარმატებით შეიქმნა.",
        businessId: result.business.id,
        businessName: result.business.name,
        plan: result.subscription.plan,
        subscriptionStatus: result.subscription.status,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Business onboarding error:", error);

    return NextResponse.json(
      {
        error: "ბიზნესის შექმნისას დაფიქსირდა შეცდომა.",
      },
      { status: 500 }
    );
  }
}