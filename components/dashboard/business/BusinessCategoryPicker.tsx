"use client";

import { Icon } from "@iconify/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

// სფერო ბაზაში უბრალო ტექსტად ინახება (Business.category) და მხოლოდ ადმინკაში ჩანს,
// ამიტომ სიის შეცვლა არსებულ ბიზნესებს არ ეხება.
export const OTHER_BUSINESS_CATEGORY = "სხვა";

export const BUSINESS_CATEGORIES = [
    { label: "ტანსაცმელი და მოდა", icon: "solar:t-shirt-bold-duotone" },
    { label: "ფეხსაცმელი", icon: "ph:sneaker-duotone" },
    { label: "ჩანთები და აქსესუარები", icon: "solar:bag-3-bold-duotone" },
    { label: "სამკაული და საათები", icon: "ph:diamond-duotone" },
    { label: "კოსმეტიკა და სილამაზე", icon: "solar:magic-stick-3-bold-duotone" },
    { label: "კვება და სასმელი", icon: "solar:cup-hot-bold-duotone" },
    { label: "საბავშვო ნივთები და სათამაშოები", icon: "ph:baby-duotone" },
    { label: "ხელნაკეთი ნივთები და საჩუქრები", icon: "solar:gift-bold-duotone" },
    { label: "სახლი და ინტერიერი", icon: "solar:sofa-bold-duotone" },
    { label: "ყვავილები და დეკორი", icon: "ph:flower-tulip-duotone" },
    { label: "ელექტრონიკა და ტექნიკა", icon: "solar:laptop-bold-duotone" },
    { label: "ავტომობილები და ავტონაწილები", icon: "ph:car-duotone" },
    { label: "სპორტი და ჯანმრთელობა", icon: "solar:dumbbell-large-bold-duotone" },
    { label: "ცხოველების მოვლა", icon: "ph:paw-print-duotone" },
    { label: "წიგნები და საკანცელარიო", icon: "solar:notebook-bold-duotone" },
    { label: "მშენებლობა და რემონტი", icon: "ph:hammer-duotone" },
    { label: OTHER_BUSINESS_CATEGORY, icon: "solar:widget-2-bold-duotone" },
] as const;

const PAGE_STEP = 5;

// ბრაუზერის <select>-ის ჩამოშლილ სიას სისტემა ხატავს და საიტის სტილს არ ემთხვევა,
// ამიტომ ეს არის "select-only combobox" (WAI-ARIA): ფოკუსი ღილაკზე რჩება, სია
// aria-activedescendant-ით იმართება. ტელეფონზე სია ქვემოდან ამოდის.
export default function BusinessCategoryPicker({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
    const baseId = useId();
    const labelId = `${baseId}-label`;
    const listId = `${baseId}-list`;
    const optionId = (index: number) => `${baseId}-option-${index}`;
    const rootRef = useRef<HTMLDivElement>(null);
    const typeahead = useRef({ text: "", timer: 0 });
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);

    const selectedIndex = BUSINESS_CATEGORIES.findIndex(category => category.label === value);
    const selected = selectedIndex >= 0 ? BUSINESS_CATEGORIES[selectedIndex] : null;

    function openAt(index: number) {
        setActive(Math.min(Math.max(index, 0), BUSINESS_CATEGORIES.length - 1));
        setOpen(true);
    }

    function choose(index: number) {
        onChange(BUSINESS_CATEGORIES[index].label);
        setOpen(false);
    }

    useEffect(() => {
        if (!open) return;
        const close = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", close);
        return () => document.removeEventListener("pointerdown", close);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
        // optionId მხოლოდ baseId-ზეა დამოკიდებული.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, active]);

    useEffect(() => () => window.clearTimeout(typeahead.current.timer), []);

    function findByTyping(key: string) {
        const state = typeahead.current;
        window.clearTimeout(state.timer);
        state.text += key;
        state.timer = window.setTimeout(() => { state.text = ""; }, 600);
        const start = open ? active : Math.max(selectedIndex, 0);
        const ordered = [...BUSINESS_CATEGORIES.keys()].map(offset => (start + (state.text.length === 1 ? 1 : 0) + offset) % BUSINESS_CATEGORIES.length);
        return ordered.find(index => BUSINESS_CATEGORIES[index].label.startsWith(state.text)) ?? -1;
    }

    function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        const last = BUSINESS_CATEGORIES.length - 1;
        if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const match = findByTyping(event.key);
            if (match >= 0) openAt(match);
            return;
        }
        if (!open) {
            if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
                event.preventDefault();
                openAt(selectedIndex >= 0 ? selectedIndex : 0);
            } else if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                openAt(event.key === "Home" ? 0 : last);
            }
            return;
        }
        const moves: Record<string, number> = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: last, PageDown: active + PAGE_STEP, PageUp: active - PAGE_STEP };
        if (event.key in moves) {
            event.preventDefault();
            setActive(Math.min(Math.max(moves[event.key], 0), last));
        } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            choose(active);
        } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
        } else if (event.key === "Tab") {
            setOpen(false);
        }
    }

    return (
        <div ref={rootRef} className="relative">
            <span id={labelId} className="mb-1.5 block text-sm text-text-secondary">საქმიანობის სფერო</span>
            <button
                type="button"
                role="combobox"
                aria-labelledby={labelId}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={open ? optionId(active) : undefined}
                disabled={disabled}
                onClick={() => (open ? setOpen(false) : openAt(selectedIndex >= 0 ? selectedIndex : 0))}
                onKeyDown={onKeyDown}
                className={`flex h-11 w-full min-w-0 items-center gap-2.5 rounded-xl border bg-background px-3 text-left text-[16px] outline-none transition-colors disabled:opacity-50 ${open ? "border-accent" : "border-border focus-visible:border-accent"}`}
            >
                {selected ? <>
                    <Icon icon={selected.icon} className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-text-primary">{selected.label}</span>
                </> : <span className="min-w-0 flex-1 truncate text-text-secondary/70">აირჩიეთ საქმიანობის სფერო</span>}
                <Icon icon="solar:alt-arrow-down-linear" className={`h-5 w-5 shrink-0 text-text-secondary transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>

            {open && <div className="fixed inset-0 z-40 bg-black/40 sm:hidden" aria-hidden="true" onClick={() => setOpen(false)} />}

            <div
                hidden={!open}
                className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-xl sm:absolute sm:inset-x-0 sm:bottom-auto sm:top-full sm:mt-2 sm:rounded-xl sm:pb-0 sm:shadow-lg"
            >
                <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:hidden">
                    <span className="font-semibold text-text-primary">საქმიანობის სფერო</span>
                    <button type="button" tabIndex={-1} onClick={() => setOpen(false)} aria-label="დახურვა" className="-mr-2 flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary">
                        <Icon icon="solar:close-circle-linear" className="h-6 w-6" aria-hidden="true" />
                    </button>
                </div>
                <ul id={listId} role="listbox" aria-labelledby={labelId} className="max-h-[60vh] overflow-y-auto overscroll-contain p-1.5 sm:max-h-72">
                    {BUSINESS_CATEGORIES.map((category, index) => {
                        const isSelected = index === selectedIndex;
                        return (
                            <li
                                key={category.label}
                                id={optionId(index)}
                                role="option"
                                aria-selected={isSelected}
                                onPointerMove={() => setActive(index)}
                                onPointerDown={event => event.preventDefault()}
                                onClick={() => choose(index)}
                                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${index === active ? "bg-accent/10" : ""} ${isSelected ? "font-medium text-accent" : "text-text-primary"}`}
                            >
                                <Icon icon={category.icon} className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                                <span className="min-w-0 flex-1">{category.label}</span>
                                {isSelected && <Icon icon="solar:check-circle-bold" className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}
