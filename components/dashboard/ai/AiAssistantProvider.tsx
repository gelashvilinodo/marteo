"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    useRef,
} from "react";
import type { AiPurchaseDraft } from "@/lib/ai/purchase-draft-types";
import { readPurchaseFile } from "@/lib/ai/purchase-file-client";

export type AiAttachment = {
    name: string;
    size: number;
};

export type AiMessage = {
    id: string;
    role: "user" | "assistant";
    text: string;
    attachment?: AiAttachment;
    // შეცდომის შეტყობინება ეკრანზე ჩანს, მაგრამ AI-ს ისტორიაში აღარ იგზავნება.
    failed?: boolean;
    progress?: { steps: string[]; current: number };
    draft?: AiPurchaseDraft;
    draftSaved?: boolean;
    link?: { href: string; label: string };
};

export type AiPurchaseTarget = "products" | "materials";

type AiState = {
    open: boolean;
    unread: boolean;
    pending: boolean;
    draft: string;
    messages: AiMessage[];
};

type AiAction =
    | { type: "open" }
    | { type: "collapse" }
    | { type: "reset" }
    | { type: "draft"; text: string }
    | { type: "send"; message: AiMessage }
    | { type: "reply"; message: AiMessage }
    | { type: "add"; message: AiMessage }
    | { type: "update"; id: string; patch: Partial<AiMessage>; done?: boolean };

const INITIAL_STATE: AiState = {
    open: false,
    unread: false,
    pending: false,
    draft: "",
    messages: [],
};

function reducer(state: AiState, action: AiAction): AiState {
    switch (action.type) {
        case "open":
            return { ...state, open: true, unread: false };
        case "collapse":
            return { ...state, open: false };
        case "reset":
            return INITIAL_STATE;
        case "draft":
            return { ...state, draft: action.text };
        case "send":
            return {
                ...state,
                draft: "",
                pending: true,
                messages: [...state.messages, action.message],
            };
        case "reply":
            // ჩაკეცილ ფანჯარაზე პასუხი ღილაკზე წერტილით გამოჩნდება.
            return {
                ...state,
                pending: false,
                unread: !state.open,
                messages: [...state.messages, action.message],
            };
        case "add":
            return { ...state, messages: [...state.messages, action.message] };
        case "update":
            return {
                ...state,
                pending: action.done ? false : state.pending,
                unread: action.done ? !state.open || state.unread : state.unread,
                messages: state.messages.map((message) =>
                    message.id === action.id ? { ...message, ...action.patch } : message),
            };
    }
}

type AiAssistantValue = AiState & {
    openPanel: () => void;
    collapse: () => void;
    reset: () => void;
    setDraft: (text: string) => void;
    send: (text: string, file?: File, target?: AiPurchaseTarget) => Promise<void>;
    updateMessage: (id: string, patch: Partial<AiMessage>) => void;
    addAssistantMessage: (message: Omit<AiMessage, "id" | "role">) => void;
};

const AiAssistantContext = createContext<AiAssistantValue | null>(null);

const FILE_STEPS = [
    "ვკითხულობ ფაილის შიგთავსს",
    "ვთარგმნი და ვალაგებ პროდუქტებს",
    "ვამოწმებ ციფრებს და ჯამებს",
];
const FAILED_REPLY = "მართეო AI დროებით მიუწვდომელია. სცადე ხელახლა.";

export function AiAssistantProvider({ children }: { children: React.ReactNode }) {
    const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
    const request = useRef<AbortController | null>(null);
    const messagesRef = useRef(state.messages);

    useEffect(() => {
        messagesRef.current = state.messages;
    }, [state.messages]);

    useEffect(() => () => request.current?.abort(), []);

    const reply = useCallback((text: string, failed = false) => {
        dispatch({
            type: "reply",
            message: { id: crypto.randomUUID(), role: "assistant", text, failed },
        });
    }, []);

    const sendFile = useCallback(async (file: File, target: AiPurchaseTarget, controller: AbortController) => {
        const id = crypto.randomUUID();
        const step = (current: number) =>
            dispatch({ type: "update", id, patch: { progress: { steps: FILE_STEPS, current } } });

        dispatch({
            type: "add",
            message: { id, role: "assistant", text: "", progress: { steps: FILE_STEPS, current: 0 } },
        });

        try {
            const { rows, photoCount } = await readPurchaseFile(file, controller.signal);
            step(1);

            const response = await fetch("/api/ai/purchase-draft", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ target, fileName: file.name, rows, photoCount }),
                signal: controller.signal,
            });
            const data = await response.json().catch(() => null) as { draft?: AiPurchaseDraft; message?: string } | null;

            if (!response.ok || !data?.draft) {
                throw new Error(data?.message || "ფაილის დამუშავება ვერ მოხერხდა. სცადე ხელახლა.");
            }

            step(2);
            const draft = data.draft;
            dispatch({
                type: "update",
                id,
                done: true,
                patch: {
                    progress: undefined,
                    draft,
                    text: `ფაილი დამუშავდა: ${draft.items.length} ${target === "products" ? "პროდუქტი" : "მასალა"}. შეამოწმე ქვემოთ, უპასუხე კითხვებს და შეინახე.`,
                },
            });
        } catch (error) {
            if (controller.signal.aborted) return;

            dispatch({
                type: "update",
                id,
                done: true,
                patch: {
                    progress: undefined,
                    failed: true,
                    text: error instanceof Error && error.message ? error.message : FAILED_REPLY,
                },
            });
        }
    }, []);

    const send = useCallback(async (text: string, file?: File, target: AiPurchaseTarget = "products") => {
        const attachment = file ? { name: file.name, size: file.size } : undefined;
        const message: AiMessage = { id: crypto.randomUUID(), role: "user", text, attachment };
        const history = [...messagesRef.current, message]
            .filter((item) => !item.failed && !item.attachment && !item.draft && !item.link && item.text)
            .map((item) => ({ role: item.role, text: item.text }));

        dispatch({ type: "send", message });

        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;

        if (file) {
            await sendFile(file, target, controller);
            if (request.current === controller) request.current = null;
            return;
        }

        try {
            const response = await fetch("/api/ai/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ messages: history }),
                signal: controller.signal,
            });
            const data = await response.json().catch(() => null) as { reply?: string; message?: string } | null;

            if (response.ok && data?.reply) {
                reply(data.reply);
            } else {
                reply(data?.message || FAILED_REPLY, true);
            }
        } catch {
            if (!controller.signal.aborted) reply(FAILED_REPLY, true);
        } finally {
            if (request.current === controller) request.current = null;
        }
    }, [reply, sendFile]);

    const reset = useCallback(() => {
        request.current?.abort();
        request.current = null;
        dispatch({ type: "reset" });
    }, []);

    const value = useMemo<AiAssistantValue>(() => ({
        ...state,
        openPanel: () => dispatch({ type: "open" }),
        collapse: () => dispatch({ type: "collapse" }),
        reset,
        setDraft: (text) => dispatch({ type: "draft", text }),
        send,
        updateMessage: (id, patch) => dispatch({ type: "update", id, patch }),
        addAssistantMessage: (message) =>
            dispatch({ type: "add", message: { ...message, id: crypto.randomUUID(), role: "assistant" } }),
    }), [state, reset, send]);

    return <AiAssistantContext value={value}>{children}</AiAssistantContext>;
}

export function useAiAssistant() {
    const value = useContext(AiAssistantContext);

    if (!value) {
        throw new Error("useAiAssistant must be used inside AiAssistantProvider");
    }

    return value;
}

// ფანჯარა კონტენტს ზემოდან ეფარება; ქვემოთ ჩაკეცილი ზოლისთვის ადგილი რჩება,
// რომ გვერდის ბოლო ელემენტები არ დაიფაროს.
export function AiAssistantInset({ children }: { children: React.ReactNode }) {
    return <div className="min-w-0 flex-1 lg:pb-11">{children}</div>;
}
