"use client";

import Image from "next/image";
import { useAiAssistant } from "./AiAssistantProvider";

// ტელეფონზე მართეო AI ჰედერიდან იხსნება, რომ გვერდის ღილაკებს არ ეფარებოდეს.
// დესკტოპზე პანელს საკუთარი ზოლი აქვს ეკრანის ქვემოთ.
export default function AiHeaderButton() {
    const { open, unread, pending, openPanel, collapse } = useAiAssistant();

    return (
        <button
            type="button"
            onClick={open ? collapse : openPanel}
            aria-expanded={open}
            aria-controls="marteo-ai-panel"
            aria-label={open ? "მართეო AI — დახურვა" : unread ? "მართეო AI (ახალი პასუხი)" : "მართეო AI"}
            className={[
                "relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition lg:hidden",
                open ? "bg-white/10 text-white" : "text-accent hover:bg-white/10",
            ].join(" ")}
        >
            <Image src="/images/marteoAI.svg" alt="" width={24} height={24} className="h-6 w-6 rounded-md" />
            {unread && <span aria-hidden="true" className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-[#0A244B]" />}
            {pending && !open && (
                <span aria-hidden="true" className="absolute inset-1 animate-spin rounded-lg border-2 border-accent/60 border-t-transparent motion-reduce:animate-none" />
            )}
        </button>
    );
}
