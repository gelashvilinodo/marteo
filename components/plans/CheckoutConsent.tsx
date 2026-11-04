"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { useState } from "react";

// გადახდის ღილაკი: პირობებზე თანხმობის გარეშე არ ირთვება. ბანკის გადახდა ჯერ მიბმული არ არის.
export default function CheckoutConsent({ amount }: { amount: string }) {
    const [agreed, setAgreed] = useState(false);
    const [notice, setNotice] = useState(false);
    return <div className="space-y-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-text-secondary">
            <input type="checkbox" checked={agreed} onChange={event => { setAgreed(event.target.checked); setNotice(false); }}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--marteo-accent)]" />
            <span>ვეთანხმები <Link href="/terms" target="_blank" className="font-medium text-accent hover:underline">მომსახურების პირობებს</Link> და ყოველთვიურ ავტომატურ გადახდას. გაუქმება ნებისმიერ დროს შემიძლია.</span>
        </label>
        <button type="button" disabled={!agreed} onClick={() => setNotice(true)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-base font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">
            <Icon icon="solar:lock-keyhole-minimalistic-bold" className="h-5 w-5" aria-hidden="true" />
            გადახდა · {amount} ₾
        </button>
        {notice && <p role="status" className="flex items-start gap-2 rounded-xl bg-accent/10 p-3 text-sm leading-6 text-text-primary">
            <Icon icon="solar:info-circle-bold-duotone" className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            ბარათით გადახდა მალე ჩაირთვება. მანამდე გეგმის გასააქტიურებლად მოგვწერე დახმარების ჩატში.
        </p>}
    </div>;
}
