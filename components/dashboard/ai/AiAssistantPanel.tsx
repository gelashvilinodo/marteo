"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@iconify/react";
import { useBusinessMode } from "@/components/dashboard/business/BusinessModeContext";
import { hasBusinessFeature } from "@/lib/business/business-mode";
import { useAiAssistant, type AiAttachment, type AiMessage, type AiPurchaseTarget } from "./AiAssistantProvider";
import AiPurchaseDraftCard from "./AiPurchaseDraftCard";
import { useKeyboardViewport } from "@/components/support/useKeyboardViewport";

const ACCEPTED_EXTENSIONS = [".numbers", ".xlsx", ".csv"];
const MAX_FILE_BYTES = 25 * 1024 * 1024;

type QuickAction = {
    label: string;
    hint: string;
    icon: string;
    // prompt იგზავნება მაშინვე; draft ველში ჩაიწერება შესავსებად; file ფაილის არჩევას ხსნის.
    prompt?: string;
    draft?: string;
    file?: true;
};

function getQuickActions(manufacturing: boolean): QuickAction[] {
    return [
        {
            label: "ამ თვის მოგება",
            hint: "შედარება წინა თვესთან",
            icon: "solar:graph-up-bold-duotone",
            prompt: "რამდენია ამ თვის მოგება და რამდენით შეიცვალა წინა თვესთან შედარებით?",
        },
        {
            label: "დღევანდელი შეკვეთები",
            hint: "რაოდენობა და სტატუსები",
            icon: "solar:cart-large-2-bold-duotone",
            prompt: "რამდენი შეკვეთა მაქვს დღეს და რა სტატუსებით?",
        },
        {
            label: "რა მთავრდება?",
            hint: manufacturing ? "პროდუქტები და მასალები" : "მარაგის ნაშთები",
            icon: "solar:box-bold-duotone",
            prompt: manufacturing
                ? "რომელი პროდუქტი ან მასალა მთავრდება მარაგში?"
                : "რომელი პროდუქტი მთავრდება მარაგში?",
        },
        {
            label: "ტოპ 5 პროდუქტი",
            hint: "ყველაზე გაყიდვადი ამ თვეში",
            icon: "solar:cup-star-bold-duotone",
            prompt: "რომელია ამ თვის 5 ყველაზე გაყიდვადი პროდუქტი?",
        },
        {
            label: "შეკვეთის მოძებნა",
            hint: "ნომრით ან კლიენტით",
            icon: "solar:magnifer-linear",
            draft: "შეკვეთა #",
        },
        {
            label: "შესყიდვა ფაილიდან",
            hint: ".numbers, .xlsx, .csv",
            icon: "solar:file-send-bold-duotone",
            file: true,
        },
    ];
}

function formatFileSize(bytes: number) {
    return bytes < 1024 * 1024
        ? `${Math.max(1, Math.round(bytes / 1024))} KB`
        : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// მოდელს მხოლოდ **მუქი** ტექსტი აქვს ნებადართული; HTML არასდროს ჩაისმება.
function FormattedText({ text }: { text: string }) {
    return text.split(/\*\*(.+?)\*\*/g).map((part, index) =>
        index % 2 === 1 ? <strong key={index} className="font-semibold">{part}</strong> : part,
    );
}

function AttachmentChip({ attachment, onRemove, inverted = false }: {
    attachment: AiAttachment;
    onRemove?: () => void;
    inverted?: boolean;
}) {
    return (
        <span
            className={[
                "inline-flex max-w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs",
                inverted ? "bg-white/15 text-white" : "bg-background text-text-primary ring-1 ring-inset ring-border",
            ].join(" ")}
        >
            <Icon icon="solar:document-text-bold-duotone" className={`h-4 w-4 shrink-0 ${inverted ? "text-white" : "text-accent"}`} aria-hidden="true" />
            <span className="min-w-0 truncate font-medium">{attachment.name}</span>
            <span className={inverted ? "text-white/70" : "text-text-secondary"}>{formatFileSize(attachment.size)}</span>
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label="ფაილის მოხსნა"
                    className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-md text-text-secondary transition hover:bg-border/60 hover:text-text-primary"
                >
                    <Icon icon="solar:close-circle-bold" className="h-4 w-4" aria-hidden="true" />
                </button>
            )}
        </span>
    );
}

function ProgressSteps({ progress }: { progress: NonNullable<AiMessage["progress"]> }) {
    return (
        <ol className="flex flex-col gap-1.5">
            {progress.steps.map((step, index) => (
                <li
                    key={step}
                    className={[
                        "flex items-center gap-2",
                        index > progress.current ? "text-text-secondary" : "text-text-primary",
                    ].join(" ")}
                >
                    {index < progress.current ? (
                        <Icon icon="solar:check-circle-bold" className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    ) : index === progress.current ? (
                        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
                    ) : (
                        <span className="h-4 w-4 shrink-0 rounded-full border-2 border-border" aria-hidden="true" />
                    )}
                    {step}…
                </li>
            ))}
        </ol>
    );
}

const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeDesktop(onChange: () => void) {
    const query = window.matchMedia(DESKTOP_QUERY);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
}

export default function AiAssistantPanel({ userName }: { userName: string }) {
    const { open, unread, pending, draft, messages, openPanel, collapse, reset, setDraft, send } = useAiAssistant();
    const mode = useBusinessMode();
    const manufacturing = hasBusinessFeature(mode, "manufacturing");
    const [file, setFile] = useState<File | null>(null);
    const [target, setTarget] = useState<AiPurchaseTarget>(mode === "MANUFACTURING" ? "materials" : "products");
    const attachment: AiAttachment | null = file ? { name: file.name, size: file.size } : null;
    const [fileError, setFileError] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLElement>(null);
    const pathname = usePathname();
    const router = useRouter();
    const navigateTimer = useRef<number | undefined>(undefined);
    const keyboard = useKeyboardViewport();
    const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_QUERY).matches, () => true);

    // ტელეფონზე ავტომატური ფოკუსი კლავიატურას გახსნიდა — მხოლოდ დესკტოპზე.
    useEffect(() => {
        if (open && desktop) textareaRef.current?.focus();
    }, [open, desktop]);

    // ღია ფანჯრისას შიდა ბმულზე დაჭერა ჯერ ფანჯარას კეცავს, გვერდი კი
    // ანიმაციის დასრულების შემდეგ იცვლება.
    useEffect(() => {
        if (!open) return;

        function onClick(event: MouseEvent) {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
            if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;

            const url = new URL(link.href, window.location.href);
            if (url.origin !== window.location.origin) return;
            if (url.pathname === window.location.pathname && url.search === window.location.search) return;

            event.preventDefault();
            collapse();
            navigateTimer.current = window.setTimeout(() => router.push(url.pathname + url.search + url.hash), desktop ? 300 : 550);
        }

        document.addEventListener("click", onClick, true);
        return () => document.removeEventListener("click", onClick, true);
    }, [open, desktop, collapse, router]);

    useEffect(() => () => window.clearTimeout(navigateTimer.current), []);

    // სხვა გზით გვერდის შეცვლისას (მაგ. ანგარიშის მენიუდან) ფანჯარა მერე მაინც იკეცება.
    const previousPath = useRef(pathname);
    useEffect(() => {
        if (previousPath.current === pathname) return;
        previousPath.current = pathname;
        collapse();
    }, [pathname, collapse]);

    // ტელეფონზე ღია ფანჯრის ქვეშ გვერდი არ უნდა სქროლდებოდეს.
    useEffect(() => {
        if (!open || desktop) return;

        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, [open, desktop]);

    // ფანჯარაზე ბორბალი გვერდს აღარ ასქროლებს: სქროლდება მხოლოდ ფანჯრის შიგთავსი
    // (მიმოწერა ან გრძელი ტექსტი), კიდეზე მისვლისას კი მოძრაობა აქვე ჩერდება.
    useEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;

        function onWheel(event: WheelEvent) {
            if (event.ctrlKey) return;

            let node = event.target instanceof Element ? event.target : null;

            while (node && node !== panel) {
                if (node instanceof HTMLElement && node.scrollHeight > node.clientHeight) {
                    const overflow = getComputedStyle(node).overflowY;

                    if (overflow === "auto" || overflow === "scroll") {
                        const atTop = node.scrollTop <= 0;
                        const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;

                        if ((event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom)) return;
                    }
                }

                node = node.parentElement;
            }

            event.preventDefault();
        }

        panel.addEventListener("wheel", onWheel, { passive: false });
        return () => panel.removeEventListener("wheel", onWheel);
    }, [desktop]);

    useEffect(() => {
        if (!open) return;

        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape" && !event.defaultPrevented) collapse();
        }

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open, collapse]);

    useEffect(() => {
        const element = scrollRef.current;
        if (element) element.scrollTop = element.scrollHeight;
    }, [messages.length, pending]);

    const canSend = !pending && (draft.trim().length > 0 || attachment !== null);

    function submit() {
        if (!canSend) return;

        void send(draft.trim() || "ამ ფაილიდან შესყიდვის დამატება მინდა.", file ?? undefined, target);
        setFile(null);
        setFileError("");
    }

    function chooseFile(file: File | undefined) {
        if (!file) return;

        const name = file.name.toLowerCase();

        if (!ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
            setFileError("მხოლოდ .numbers, .xlsx და .csv ფაილები მიიღება.");
            return;
        }

        if (file.size > MAX_FILE_BYTES) {
            setFileError("ფაილი 25 MB-ზე დიდია.");
            return;
        }

        setFile(file);
        setFileError("");
        textareaRef.current?.focus();
    }

    function runQuickAction(action: QuickAction) {
        if (action.file) {
            fileInputRef.current?.click();
        } else if (action.draft) {
            setDraft(action.draft);
            textareaRef.current?.focus();
        } else if (action.prompt && !pending) {
            void send(action.prompt);
        }
    }

    function close() {
        if (messages.length > 0 && !window.confirm("მიმოწერა წაიშლება. დახურო მართეო AI?")) return;

        setFile(null);
        setFileError("");
        reset();
    }

    function toggle() {
        if (open) collapse();
        else openPanel();
    }

    const conversation = (
        <>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                {messages.length === 0 ? (
                    <div className="flex min-h-full flex-col justify-end">
                        <div className="mb-5">
                            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                                <Icon icon="solar:stars-minimalistic-bold-duotone" className="h-6 w-6" aria-hidden="true" />
                            </div>
                            <p className="text-lg font-semibold text-text-primary">
                                გამარჯობა{userName ? `, ${userName}` : ""}!
                            </p>
                            <p className="mt-1 text-sm text-text-secondary">
                                მკითხე მოგებაზე, შეკვეთებზე ან მარაგზე, ან ატვირთე შესყიდვის ფაილი.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            {getQuickActions(manufacturing).map((action) => (
                                <button
                                    key={action.label}
                                    type="button"
                                    onClick={() => runQuickAction(action)}
                                    className={[
                                        "flex flex-col items-start gap-1.5 rounded-xl border border-border bg-background p-3 text-left",
                                        "transition hover:border-accent/50 hover:bg-accent/5",
                                        "focus-visible:outline-2 focus-visible:outline-accent",
                                    ].join(" ")}
                                >
                                    <Icon icon={action.icon} className="h-5 w-5 text-accent" aria-hidden="true" />
                                    <span className="text-sm font-medium leading-tight text-text-primary">{action.label}</span>
                                    <span className="text-xs leading-tight text-text-secondary">{action.hint}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <ol className="flex flex-col gap-3" aria-live="polite">
                        {messages.map((message) => (
                            <li
                                key={message.id}
                                className={message.role === "user" ? "flex justify-end" : "flex flex-col items-start gap-2"}
                            >
                                {message.progress ? (
                                    <div className="rounded-2xl rounded-bl-md bg-background px-3.5 py-3 text-sm ring-1 ring-inset ring-border">
                                        <ProgressSteps progress={message.progress} />
                                    </div>
                                ) : (
                                <div
                                    className={[
                                        "flex max-w-[85%] flex-col gap-2 whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm",
                                        message.role === "user"
                                            ? "rounded-br-md bg-accent text-white"
                                            : message.failed
                                                ? "rounded-bl-md bg-danger/10 text-danger ring-1 ring-inset ring-danger/30"
                                                : "rounded-bl-md bg-background text-text-primary ring-1 ring-inset ring-border",
                                    ].join(" ")}
                                >
                                    {message.attachment && (
                                        <AttachmentChip attachment={message.attachment} inverted={message.role === "user"} />
                                    )}
                                    <span><FormattedText text={message.text} /></span>
                                </div>
                                )}

                                {message.draft && <AiPurchaseDraftCard message={{ ...message, draft: message.draft }} />}

                                {message.link && (
                                    <Link
                                        href={message.link.href}
                                        prefetch={false}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-sm font-medium text-white transition hover:bg-accent-hover"
                                    >
                                        {message.link.label}
                                        <Icon icon="solar:arrow-right-linear" className="h-4 w-4" aria-hidden="true" />
                                    </Link>
                                )}
                            </li>
                        ))}

                        {pending && (
                            <li className="flex justify-start" aria-label="მართეო AI წერს">
                                <span className="inline-flex gap-1 rounded-2xl rounded-bl-md bg-background px-3.5 py-3 ring-1 ring-inset ring-border">
                                    {[0, 150, 300].map((delay) => (
                                        <span
                                            key={delay}
                                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary motion-reduce:animate-none"
                                            style={{ animationDelay: `${delay}ms` }}
                                        />
                                    ))}
                                </span>
                            </li>
                        )}
                    </ol>
                )}
            </div>

            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                }}
                className={`shrink-0 border-t border-border p-3 ${!desktop && !keyboard.open ? "pb-[max(0.75rem,env(safe-area-inset-bottom))]" : ""}`}
            >
                {(attachment || fileError) && (
                    <div className="mb-2 flex flex-col items-start gap-1">
                        {attachment && <AttachmentChip attachment={attachment} onRemove={() => setFile(null)} />}
                        {attachment && mode === "HYBRID" && (
                            <div className="flex items-center gap-2 text-xs text-text-secondary">
                                <span>დავამატო:</span>
                                {(["products", "materials"] as const).map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setTarget(value)}
                                        aria-pressed={target === value}
                                        className={[
                                            "rounded-lg px-2 py-1 font-medium transition",
                                            target === value ? "bg-accent text-white" : "ring-1 ring-inset ring-border hover:text-text-primary",
                                        ].join(" ")}
                                    >
                                        {value === "products" ? "პროდუქტებში" : "მასალებში"}
                                    </button>
                                ))}
                            </div>
                        )}
                        {fileError && <p role="alert" className="text-xs text-danger">{fileError}</p>}
                    </div>
                )}

                <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-background p-1.5 focus-within:border-accent">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPTED_EXTENSIONS.join(",")}
                        className="hidden"
                        onChange={(event) => {
                            chooseFile(event.target.files?.[0]);
                            event.target.value = "";
                        }}
                    />

                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        aria-label="ფაილის დამატება"
                        title="ფაილის დამატება"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-secondary transition hover:bg-border/50 hover:text-text-primary"
                    >
                        <Icon icon="solar:add-circle-linear" className="h-5 w-5" aria-hidden="true" />
                    </button>

                    <textarea
                        ref={textareaRef}
                        value={draft}
                        rows={1}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                event.preventDefault();
                                submit();
                            }
                        }}
                        placeholder="დაწერე კითხვა..."
                        aria-label="შეტყობინება მართეო AI-სთვის"
                        className="field-sizing-content max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-base text-text-primary outline-none placeholder:text-text-secondary lg:text-sm"
                    />

                    <button
                        type="submit"
                        disabled={!canSend}
                        aria-label="გაგზავნა"
                        title="გაგზავნა"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Icon icon="solar:plain-2-bold" className="h-[18px] w-[18px]" aria-hidden="true" />
                    </button>
                </div>
            </form>
        </>
    );

    const headerActions = (
        <div className="flex items-center">
            <button
                type="button"
                onClick={toggle}
                aria-label={open ? "ჩაკეცვა" : "გახსნა"}
                title={open ? "ჩაკეცვა" : "გახსნა"}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white lg:h-8 lg:w-8"
            >
                <Icon
                    icon="solar:alt-arrow-down-linear"
                    className={`h-[18px] w-[18px] transition-transform duration-300 ${open ? "" : "rotate-180"}`}
                    aria-hidden="true"
                />
            </button>

            {messages.length > 0 && (
                <button
                    type="button"
                    onClick={close}
                    aria-label="დახურვა და მიმოწერის წაშლა"
                    title="დახურვა"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white lg:h-8 lg:w-8"
                >
                    <Icon icon="solar:close-square-linear" className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
            )}
        </div>
    );

    const title = (
        <>
            <Image src="/icon.svg" alt="" width={22} height={22} className="h-[22px] w-[22px] rounded-md" />
            <span className="truncate text-sm font-semibold text-white">მართეო AI</span>
            {unread && <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-danger" />}
            {pending && !open && (
                <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/70 border-t-transparent motion-reduce:animate-none" />
            )}
        </>
    );

    if (desktop) {
        return (
            <aside
                key="desktop"
                ref={panelRef}
                id="marteo-ai-panel"
                aria-label="მართეო AI"
                className={[
                    "fixed bottom-0 right-6 z-30 hidden h-[min(680px,calc(100dvh-6rem))] w-[400px] flex-col overflow-hidden lg:flex",
                    "rounded-t-2xl border border-b-0 border-border bg-surface shadow-[0_-0.5rem_2.5rem_-0.75rem_rgb(15_28_46/0.35)]",
                    "transition-transform duration-300 ease-out motion-reduce:transition-none",
                    open ? "translate-y-0" : "translate-y-[calc(100%-2.75rem)]",
                ].join(" ")}
            >
                {/* ჩაკეცილ მდგომარეობაში ეკრანის ქვემოთ მხოლოდ ეს ზოლი ჩანს. */}
                <header className="flex h-11 shrink-0 items-center justify-between gap-2 bg-[#0A244B] px-1.5">
                    <button
                        type="button"
                        onClick={toggle}
                        aria-expanded={open}
                        aria-controls="marteo-ai-body"
                        aria-label={open ? "მართეო AI — ჩაკეცვა" : unread ? "მართეო AI (ახალი პასუხი)" : "მართეო AI — გახსნა"}
                        className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-1.5 text-left"
                    >
                        {title}
                    </button>

                    {headerActions}
                </header>

                <div id="marteo-ai-body" inert={!open} className="flex min-h-0 flex-1 flex-col">
                    {conversation}
                </div>
            </aside>
        );
    }

    // ტელეფონი: მრგვალი ღილაკი ქვედა კუთხეში იზრდება მთელ ეკრანზე (ჰედერის ქვემოთ),
    // ისევე როგორც პროფილის ჩამოსაშლელი ჰედერში. ღია კლავიატურისას ფანჯარა
    // ხილულ არეს ეკვრის, ასე რომ ჰედერიც და ველიც ყოველთვის ჩანს.
    const hidden = !open && pathname.startsWith("/dashboard/help");
    const fullHeight = "calc(100dvh - 4rem - env(safe-area-inset-top))";
    const box: React.CSSProperties = keyboard.open && open
        ? { top: keyboard.top, bottom: "auto", right: 0, width: "100vw", height: keyboard.height, borderRadius: 0, zIndex: 60, transition: "none" }
        : open
            ? { right: 0, bottom: 0, width: "100vw", height: fullHeight, borderRadius: 0 }
            : { right: 16, bottom: "calc(1rem + env(safe-area-inset-bottom))", width: 56, height: 56, borderRadius: 16 };

    return (
        <aside
            key="mobile"
            ref={panelRef}
            id="marteo-ai-panel"
            aria-label="მართეო AI"
            className={[
                "fixed z-30 overflow-hidden bg-[#0A244B] ring-1 ring-inset ring-white/10",
                "transition-[width,height,right,bottom,border-radius,box-shadow] duration-[550ms] ease-in-out motion-reduce:transition-none",
                open ? "" : "shadow-xl shadow-[#0A244B]/30",
                hidden ? "hidden" : "",
            ].join(" ")}
            style={box}
        >
            {/* ჩაკეცილი: მხოლოდ ღილაკი */}
            <button
                type="button"
                onClick={openPanel}
                tabIndex={open ? -1 : 0}
                aria-hidden={open}
                aria-label={unread ? "მართეო AI (ახალი პასუხი)" : "მართეო AI"}
                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${open ? "pointer-events-none opacity-0" : "opacity-100 delay-300"}`}
            >
                <Icon icon="solar:stars-minimalistic-bold-duotone" className="h-7 w-7 text-accent" aria-hidden="true" />
                {unread && <span aria-hidden="true" className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-[#0A244B]" />}
                {pending && !open && (
                    <span aria-hidden="true" className="absolute inset-1.5 animate-spin rounded-xl border-2 border-accent/60 border-t-transparent motion-reduce:animate-none" />
                )}
            </button>

            {/* სრული ფანჯარა საბოლოო ზომისაა და იზრდებოდა ყუთთან ერთად ჩნდება. */}
            <div
                id="marteo-ai-body"
                inert={!open}
                aria-hidden={!open}
                className={`absolute right-0 bottom-0 flex w-screen flex-col transition-opacity duration-300 ${open ? "opacity-100 delay-150" : "pointer-events-none opacity-0"}`}
                style={{ height: keyboard.open && open ? keyboard.height : fullHeight }}
            >
                <header
                    className="flex shrink-0 items-center justify-between gap-2 bg-[#0A244B] px-3 pb-2"
                    style={{
                        paddingTop: keyboard.open && open
                            ? `max(0.5rem, calc(env(safe-area-inset-top) - ${keyboard.top}px + 0.5rem))`
                            : "0.5rem",
                    }}
                >
                    <div className="flex min-w-0 items-center gap-2">{title}</div>
                    {headerActions}
                </header>

                <div className="flex min-h-0 flex-1 flex-col bg-surface">
                    {conversation}
                </div>
            </div>
        </aside>
    );
}
