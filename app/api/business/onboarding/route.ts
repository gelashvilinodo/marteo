import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const userId =
      typeof body.userId === "string" ? body.userId.trim() : "";

    const name =
      typeof body.name === "string" ? body.name.trim() : "";

    const phone =
      typeof body.phone === "string" ? body.phone.trim() : "";

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    const address =
      typeof body.address === "string" ? body.address.trim() : "";

    const website =
      typeof body.website === "string" ? body.website.trim() : "";

    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : "";

    if (!userId || !name) {
      return NextResponse.json(
        {
          error: "მომხმარებლის ID და ბიზნესის სახელი აუცილებელია.",
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
        status: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
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

    if (
      user.status !== "ACTIVE" ||
      !user.emailVerifiedAt ||
      !user.phoneVerifiedAt
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
          phone: phone || null,
          email: email || null,
          address: address || null,
          website: website || null,
          description: description || null,
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