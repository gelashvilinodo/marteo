import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { orderJson, orderError } from "@/lib/orders/order-http";
import { OrderValidationError } from "@/lib/orders/validate-order";
import { ProductImageError, uploadProductImage } from "@/lib/purchases/product-images";

export async function POST(request: Request) {
    try {
        if (request.headers.get("origin") !== new URL(request.url).origin) {
            throw new OrderValidationError("მოთხოვნის წყარო დაუშვებელია.", 403);
        }
        const user = await getCurrentUser();
        if (!user) throw new OrderValidationError("ფოტოს ასატვირთად შედი ანგარიშში.", 401);
        const prisma = createPrismaClient();
        let businessId: string;
        try {
            const membership = await prisma.businessMembership.findFirst({
                where: { userId: user.id },
                orderBy: [{ createdAt: "asc" }, { businessId: "asc" }],
                select: { businessId: true },
            });
            if (!membership) throw new OrderValidationError("ბიზნესი ვერ მოიძებნა.", 403);
            businessId = membership.businessId;
        } finally {
            await prisma.$disconnect();
        }
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || !file.size) {
            throw new OrderValidationError("აირჩიე პროდუქტის ფოტო.");
        }
        const uploaded = await uploadProductImage(businessId, file);
        return orderJson({ success: true, imageUrl: uploaded.url }, 201);
    } catch (cause: unknown) {
        if (cause instanceof ProductImageError) {
            return orderJson({ success: false, message: cause.message }, 422);
        }
        return orderError(cause);
    }
}
