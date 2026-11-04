import { costSafeJson } from "@/lib/business/redact-costs";
import { apiAccessDenied } from "@/lib/business/access";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { orderJson, orderError } from "@/lib/orders/order-http";
import { OrderValidationError } from "@/lib/orders/validate-order";
import { ProductImageError, uploadProductImage } from "@/lib/purchases/product-images";
import { findActiveMembership } from "@/lib/auth/active-business";

export async function POST(request: Request) {
    const accessDenied = await apiAccessDenied("ORDERS", "edit", { feature: "orderPhotos" }); if (accessDenied) return accessDenied;
    try {
        if (request.headers.get("origin") !== new URL(request.url).origin) {
            throw new OrderValidationError("მოთხოვნის წყარო დაუშვებელია.", 403);
        }
        const user = await getCurrentUser();
        if (!user) throw new OrderValidationError("ფოტოს ასატვირთად შედი ანგარიშში.", 401);
        const prisma = createPrismaClient();
        let businessId: string;
        try {
            const membership = await findActiveMembership(prisma, user.id);
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
        const thumbnail = form.get("thumbnail");
        if (thumbnail !== null && !(thumbnail instanceof File)) throw new OrderValidationError("მცირე ფოტოს მონაცემები არასწორია.");
        const uploaded = await uploadProductImage(businessId, file, thumbnail);
        return costSafeJson({ success: true, imageUrl: uploaded.url }, 201);
    } catch (cause: unknown) {
        if (cause instanceof ProductImageError) {
            return orderJson({ success: false, message: cause.message }, 422);
        }
        return orderError(cause);
    }
}
