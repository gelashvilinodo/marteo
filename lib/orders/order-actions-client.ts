"use client";

export type OrderMutationResult = {
    id: string;
    number: number | null;
    version: number;
    action: string;
    readyToDelete?: boolean;
};
export class OrderActionError extends Error {
    constructor(message: string, public status: number) { super(message); this.name = "OrderActionError"; }
}
export async function sendOrderAction(
    orderId: string,
    action:
        | "edit"
        | "status"
        | "return"
        | "delete"
        | "link"
        | "exchange"
        | "refund"
        | "cancel-deletion",
    payload: Record<string, unknown>,
    signal?: AbortSignal,
) {
    // ერთი გამოძახების ყველა ქსელური განმეორება ერთსა და იმავე requestId-ს იყენებს.
    const body = JSON.stringify({ ...payload, requestId: typeof payload.requestId === "string" ? payload.requestId : crypto.randomUUID() });
    const suffix = action === "edit" || action === "delete" ? "" : action === "link" ? "/invoice/link" : `/${action}`;
    const method = action === "delete" ? "DELETE" : action === "edit" || action === "status" ? "PATCH" : "POST";
    for (let attempt = 0; ; attempt++) {
        try {
            const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}${suffix}`, { method, headers: { "Content-Type": "application/json" }, body, signal });
            const data = await response.json() as { success?: boolean; message?: string; order?: OrderMutationResult };
            if (!response.ok || !data.success || !data.order) throw new OrderActionError(data.message || "მოქმედება ვერ შესრულდა.", response.status);
            return data.order;
        } catch (cause: unknown) {
            if (signal?.aborted || cause instanceof OrderActionError && cause.status < 500 || attempt >= 1) throw cause;
        }
    }
}
export async function deleteSelectedOrders(targets: Array<{ id: string; expectedVersion: number; stockReturned?: boolean }>, onResult?: (result: { id: string; success: boolean; message?: string }) => void, signal?: AbortSignal) {
    const results: Array<{ id: string; success: boolean; message?: string }> = [];
    for (const target of targets) {
        if (signal?.aborted) break;
        try {
            await sendOrderAction(
                target.id,
                "delete",
                {
                    expectedVersion: target.expectedVersion,
                    confirmDeletion: true,
                    mode: target.stockReturned === true
                        ? "RECEIVED"
                        : undefined,
                },
                signal,
            );
            const result = { id: target.id, success: true }; results.push(result); onResult?.(result);
        } catch (cause: unknown) {
            const result = { id: target.id, success: false, message: cause instanceof Error ? cause.message : "წაშლა ვერ შესრულდა." };
            results.push(result); onResult?.(result);
        }
    }
    return results;
}
