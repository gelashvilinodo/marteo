import type { AiCardGroup } from "./ai-cards";

export type AiConversationSummary = {
    id: string;
    title: string | null;
    preview: string | null;
    updatedAt: string;
};

export type StoredAiMessage = {
    id: string;
    role: "user" | "assistant";
    text: string;
    failed?: boolean;
    attachment?: { name: string; size: number };
    cards?: AiCardGroup[];
    link?: { href: string; label: string };
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init });
    const body = await response.json().catch(() => null) as (T & { success?: boolean; message?: string; error?: string }) | null;

    if (!response.ok || !body?.success) {
        throw new Error(body?.message || body?.error || "ჩათების ისტორია ვერ ჩაიტვირთა.");
    }

    return body;
}

export async function fetchConversations() {
    return (await request<{ conversations: AiConversationSummary[] }>("/api/ai/conversations")).conversations;
}

export async function fetchConversation(id: string) {
    return request<{ conversation: { id: string; title: string | null; messages: StoredAiMessage[]; updatedAt: string } }>(
        `/api/ai/conversations/${encodeURIComponent(id)}`,
    ).then((body) => body.conversation);
}

export async function saveConversationRemote(id: string, messages: StoredAiMessage[], title?: string) {
    return request<{ title: string | null; updatedAt: string }>(`/api/ai/conversations/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, title }),
    });
}

export async function deleteConversationRemote(id: string) {
    await request<unknown>(`/api/ai/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function requestConversationTitle(id: string) {
    return (await request<{ title: string | null }>(`/api/ai/conversations/${encodeURIComponent(id)}/title`, { method: "POST" })).title;
}
