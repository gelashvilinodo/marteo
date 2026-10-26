import { NextResponse } from "next/server";
import { createPrismaClient } from "@/lib/prisma";
import { consumeRegistrationOtp, readOtpRequest, RegistrationError, registrationErrorResponse } from "@/lib/auth/registration-otp";

export async function POST(request: Request) {
    const input = await readOtpRequest(request);
    if (!input) return NextResponse.json({ error: "დადასტურების მონაცემები არასწორია." }, { status: 400 });
    let prisma: ReturnType<typeof createPrismaClient> | undefined;
    try {
        prisma = createPrismaClient();
        const result = await prisma.$transaction(async (tx) => {
            const verified = await consumeRegistrationOtp(tx, input.userId, "EMAIL", input.code);
            // Returning a failure commits the failed-attempt counter.
            if (!verified.ok) return verified;
            const updated = await tx.user.updateMany({
                where: { id: input.userId, status: "PENDING_VERIFICATION", emailVerifiedAt: null },
                data: { emailVerifiedAt: new Date() },
            });
            if (updated.count !== 1) throw new RegistrationError("ანგარიშის მდგომარეობა შეიცვალა. სცადეთ ხელახლა.", 409);
            await tx.verificationToken.deleteMany({ where: { userId: input.userId, type: "EMAIL", usedAt: null } });
            return { ok: true as const };
        }, { isolationLevel: "Serializable" });
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json({ status: "success" });
    } catch (error) {
        return registrationErrorResponse(error);
    } finally {
        await prisma?.$disconnect();
    }
}
