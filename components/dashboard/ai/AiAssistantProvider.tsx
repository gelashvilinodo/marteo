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
import type { AiCardGroup } from "@/lib/ai/ai-cards";
import { readPurchaseFile } from "@/lib/ai/purchase-file-client";
import {
    deleteConversationRemote,
    fetchConversation,
    fetchConversations,
    requestConversationTitle,
    saveConversationRemote,
    type AiConversationSummary,
    type StoredAiMessage,
} from "@/lib/ai/ai-conversations-client";

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
    // ნაპოვნი შეკვეთები, პროდუქტები ან მომხმარებლები ბარათებად.
    cards?: AiCardGroup[];
};

export type AiPurchaseTarget = "products" | "materials";

type AiState = {
    open: boolean;
    unread: boolean;
    pending: boolean;
    draft: string;
    messages: AiMessage[];
    // მიმდინარე ჩათი; null — ჯერ არაფერი გაგზავნილა.
    conversationId: string | null;
    title: string | null;
    view: "chat" | "list";
    // null — სია ჯერ არ ჩატვირთულა.
    history: AiConversationSummary[] | null;
    // X-ით დახურვის შემდეგ შემდეგი გახსნა ჩათების სიას აჩვენებს.
    listOnOpen: boolean;
    loadingConversation: boolean;
    historyError: string;
};

type AiAction =
    | { type: "open" }
    | { type: "collapse" }
    | { type: "reset" }
    | { type: "draft"; text: string }
    | { type: "send"; message: AiMessage }
    | { type: "reply"; message: AiMessage }
    | { type: "add"; message: AiMessage }
    | { type: "notify"; message: AiMessage | null }
    | { type: "update"; id: string; patch: Partial<AiMessage>; done?: boolean }
    | { type: "close" }
    | { type: "newChat" }
    | { type: "showList" }
    | { type: "history"; history: AiConversationSummary[] }
    | { type: "historyError"; message: string }
    | { type: "loading"; loading: boolean }
    | { type: "load"; id: string; title: string | null; messages: AiMessage[] }
    | { type: "saved"; summary: AiConversationSummary }
    | { type: "removed"; id: string }
    | { type: "start"; id: string };

const INITIAL_STATE: AiState = {
    open: false,
    unread: false,
    pending: false,
    draft: "",
    messages: [],
    conversationId: null,
    title: null,
    view: "chat",
    history: null,
    listOnOpen: true,
    loadingConversation: false,
    historyError: "",
};

const EMPTY_CHAT = { messages: [], conversationId: null, title: null, draft: "", pending: false, view: "chat" as const };

function reducer(state: AiState, action: AiAction): AiState {
    switch (action.type) {
        case "open": {
            // ისტორიის გარეშე პირდაპირ ჩატი იხსნება, ისტორიით — ჯერ სია.
            // სია ჯერ თუ იტვირთება, ჩატვირთვის ჩონჩხი ჩანს; ცარიელ სიაზე ჩატი თავისით იხსნება.
            if (!state.listOnOpen) return { ...state, open: true, unread: false };
            const empty = state.history !== null && state.history.length === 0;
            return {
                ...state,
                open: true,
                unread: false,
                listOnOpen: false,
                ...(empty ? EMPTY_CHAT : { view: "list" as const }),
            };
        }
        case "collapse":
            return { ...state, open: false };
        case "close":
            return { ...state, open: false, listOnOpen: true };
        case "reset":
            return INITIAL_STATE;
        case "newChat":
            return { ...state, ...EMPTY_CHAT };
        case "showList":
            return { ...state, view: "list" };
        case "history":
            return {
                ...state,
                history: action.history,
                historyError: "",
                view: state.view === "list" && action.history.length === 0 ? "chat" : state.view,
            };
        case "historyError":
            return { ...state, historyError: action.message, history: state.history ?? [] };
        case "loading":
            return { ...state, loadingConversation: action.loading };
        case "load":
            return {
                ...state,
                ...EMPTY_CHAT,
                conversationId: action.id,
                title: action.title,
                messages: action.messages,
                loadingConversation: false,
                listOnOpen: false,
            };
        case "start":
            return { ...state, conversationId: action.id };
        case "saved": {
            const rest = (state.history ?? []).filter((item) => item.id !== action.summary.id);
            return {
                ...state,
                history: [action.summary, ...rest],
                title: state.conversationId === action.summary.id ? action.summary.title : state.title,
            };
        }
        case "removed": {
            const current = state.conversationId === action.id;
            const history = (state.history ?? []).filter((item) => item.id !== action.id);
            return {
                ...state,
                history,
                ...(current ? EMPTY_CHAT : {}),
                view: history.length === 0 ? "chat" : current ? "list" : state.view,
            };
        }
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
        case "notify":
            // AI-ის საკუთარი შეტყობინება (კვირის მიმოხილვა) — დახურულ პანელზე წერტილით.
            return {
                ...state,
                unread: !state.open,
                messages: action.message ? [...state.messages, action.message] : state.messages,
            };
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
    close: () => void;
    reset: () => void;
    newChat: () => void;
    showList: () => void;
    openConversation: (id: string) => Promise<void>;
    deleteConversation: (id: string) => Promise<void>;
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
const DIGEST_KEY = "marteo.ai.digest-week";

// კვირის დასაწყისი (ორშაბათი) თბილისის დროით.
function currentWeek() {
    const local = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const weekday = (local.getUTCDay() + 6) % 7;
    return new Date(local.getTime() - weekday * 86_400_000).toISOString().slice(0, 10);
}

function readStorage(key: string) {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // პირად რეჟიმში საცავი შეიძლება მიუწვდომელი იყოს; მიმოხილვა მაშინ ხელახლა გამოჩნდება.
    }
}

// პოსტის მონახაზის ტექსტი AI-ს ისტორიაში უბრუნდება, რომ „უფრო მოკლე გააკეთე“ იმუშაოს.
function withDrafts(message: AiMessage) {
    const drafts = message.cards?.flatMap((group) => group.kind === "draft" ? group.items : []) ?? [];
    if (drafts.length === 0) return message.text;

    const added = drafts.map((draft) => `[პოსტის მონახაზი: ${draft.title}, ${draft.date} ${draft.time}]\n${draft.text}`).join("\n\n");
    return `${message.text}\n\n${added}`.slice(0, 6000);
}

function firstUserText(messages: StoredAiMessage[]) {
    return messages.find((message) => message.role === "user")?.text.slice(0, 120) ?? null;
}

// ისტორიაში მხოლოდ დასრულებული შეტყობინებები ინახება (პროგრესი და ფაილის მონახაზი — არა).
function storable(messages: AiMessage[]): StoredAiMessage[] {
    return messages
        .filter((message) => !message.progress)
        .map(({ id, role, text, failed, attachment, cards, link }) => ({ id, role, text, failed, attachment, cards, link }));
}

// enabled=false: AI მხოლოდ მფლობელისაა, თანამშრომლისთვის მიმოხილვა არ მზადდება.
export function AiAssistantProvider({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) {
    const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
    const request = useRef<AbortController | null>(null);
    const messagesRef = useRef(state.messages);

    useEffect(() => {
        messagesRef.current = state.messages;
    }, [state.messages]);

    useEffect(() => () => request.current?.abort(), []);

    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    // ჩათების სია ერთხელ იტვირთება, რომ გახსნისას ვიცოდეთ, სია ვაჩვენოთ თუ ახალი ჩათი.
    useEffect(() => {
        if (!enabled) return;

        let active = true;
        fetchConversations()
            .then((history) => { if (active) dispatch({ type: "history", history }); })
            .catch((error: unknown) => {
                if (active) dispatch({ type: "historyError", message: error instanceof Error ? error.message : "ჩათების ისტორია ვერ ჩაიტვირთა." });
            });
        return () => { active = false; };
    }, [enabled]);

    // ყოველი დასრულებული პასუხის შემდეგ ჩათი ბაზაში ინახება; პირველი პასუხის შემდეგ
    // AI სათაურს წერს.
    const titled = useRef(new Set<string>());
    // ბოლოს შენახული (ან ბაზიდან გახსნილი) შეტყობინებები — ძველი ჩათის გახსნა მას თავიდან არ ინახავს.
    const lastSaved = useRef<AiMessage[] | null>(null);
    const { conversationId, messages, pending } = state;
    useEffect(() => {
        if (!enabled || !conversationId || pending || messages === lastSaved.current) return;
        if (!messages.some((message) => message.role === "user") || messages.some((message) => message.progress)) return;

        const stored = storable(messages);
        const timer = window.setTimeout(() => {
            lastSaved.current = messages;
            saveConversationRemote(conversationId, stored)
                .then((saved) => {
                    dispatch({
                        type: "saved",
                        summary: { id: conversationId, title: saved.title, preview: firstUserText(stored), updatedAt: saved.updatedAt },
                    });

                    const answered = stored.some((message) => message.role === "assistant" && !message.failed);
                    if (saved.title || !answered || titled.current.has(conversationId)) return;

                    titled.current.add(conversationId);
                    return requestConversationTitle(conversationId).then((title) => {
                        if (title) {
                            dispatch({
                                type: "saved",
                                summary: { id: conversationId, title, preview: firstUserText(stored), updatedAt: saved.updatedAt },
                            });
                        }
                    });
                })
                .catch(() => undefined);
        }, 600);

        return () => window.clearTimeout(timer);
    }, [enabled, conversationId, messages, pending]);

    // კვირის პირველ შემოსვლაზე AI თავად ამზადებს მოკლე მიმოხილვას.
    useEffect(() => {
        const week = currentWeek();
        if (!enabled || readStorage(DIGEST_KEY) === week) return;

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            fetch("/api/ai/digest", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
                .then((response) => response.ok ? response.json() as Promise<{ digest?: { text: string; cards: AiCardGroup[] } | null }> : null)
                .then((body) => {
                    if (!body) return;
                    writeStorage(DIGEST_KEY, week);
                    if (!body.digest) return;

                    // მიმოხილვა ცალკე ჩათად ინახება; თუ ახლა ცარიელი ჩათია, პირდაპირ ის იხსნება.
                    const id = crypto.randomUUID();
                    const message: AiMessage = {
                        id: crypto.randomUUID(),
                        role: "assistant",
                        text: body.digest.text,
                        cards: body.digest.cards.length ? body.digest.cards : undefined,
                    };
                    const title = "კვირის მიმოხილვა";
                    return saveConversationRemote(id, storable([message]), title).then((saved) => {
                        dispatch({ type: "saved", summary: { id, title: saved.title ?? title, preview: null, updatedAt: saved.updatedAt } });
                        if (stateRef.current.messages.length === 0) {
                            const loaded = [message];
                            lastSaved.current = loaded;
                            dispatch({ type: "load", id, title, messages: loaded });
                        }
                        dispatch({ type: "notify", message: null });
                    });
                })
                .catch(() => undefined);
        }, 4000);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [enabled]);

    const reply = useCallback((text: string, failed = false, cards?: AiCardGroup[]) => {
        dispatch({
            type: "reply",
            message: { id: crypto.randomUUID(), role: "assistant", text, failed, cards: cards?.length ? cards : undefined },
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
            .map((item) => ({ role: item.role, text: withDrafts(item) }));

        if (!stateRef.current.conversationId) dispatch({ type: "start", id: crypto.randomUUID() });
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
            const data = await response.json().catch(() => null) as { reply?: string; cards?: AiCardGroup[]; message?: string } | null;

            if (response.ok && data?.reply) {
                reply(data.reply, false, Array.isArray(data.cards) ? data.cards : undefined);
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

    // სხვა ჩათზე გადასვლისას მიმდინარე პასუხი წყდება, რომ სხვა ჩათში არ ჩაიწეროს.
    const stopRequest = useCallback(() => {
        request.current?.abort();
        request.current = null;
    }, []);

    const openConversation = useCallback(async (id: string) => {
        stopRequest();
        dispatch({ type: "loading", loading: true });
        try {
            const conversation = await fetchConversation(id);
            const loaded = conversation.messages as AiMessage[];
            lastSaved.current = loaded;
            dispatch({ type: "load", id, title: conversation.title, messages: loaded });
        } catch (error) {
            dispatch({ type: "loading", loading: false });
            dispatch({ type: "historyError", message: error instanceof Error ? error.message : "ჩათი ვერ ჩაიტვირთა." });
        }
    }, [stopRequest]);

    const deleteConversation = useCallback(async (id: string) => {
        if (stateRef.current.conversationId === id) stopRequest();
        try {
            await deleteConversationRemote(id);
            dispatch({ type: "removed", id });
        } catch (error) {
            dispatch({ type: "historyError", message: error instanceof Error ? error.message : "ჩათი ვერ წაიშალა." });
        }
    }, [stopRequest]);

    const value = useMemo<AiAssistantValue>(() => ({
        ...state,
        openPanel: () => dispatch({ type: "open" }),
        collapse: () => dispatch({ type: "collapse" }),
        close: () => dispatch({ type: "close" }),
        reset,
        newChat: () => {
            stopRequest();
            dispatch({ type: "newChat" });
        },
        showList: () => dispatch({ type: "showList" }),
        openConversation,
        deleteConversation,
        setDraft: (text) => dispatch({ type: "draft", text }),
        send,
        updateMessage: (id, patch) => dispatch({ type: "update", id, patch }),
        addAssistantMessage: (message) =>
            dispatch({ type: "add", message: { ...message, id: crypto.randomUUID(), role: "assistant" } }),
    }), [state, reset, send, stopRequest, openConversation, deleteConversation]);

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
