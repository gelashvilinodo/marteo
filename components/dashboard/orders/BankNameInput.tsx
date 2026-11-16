"use client";

import { useEffect, useId, useState } from "react";

// ველის ყოველ გამოჩენაზე სია თავიდან მოდის (შენახული ახალი ბანკიც), მანამდე წინა სია ჩანს.
let cached: string[] | null = null;
let loading: Promise<string[]> | null = null;

function loadBanks() {
    loading ??= fetch("/api/orders/bank-names", { cache: "no-store", credentials: "same-origin" })
        .then(response => response.ok ? response.json() as Promise<{ banks?: string[] }> : { banks: [] })
        .then(body => { cached = body.banks ?? []; return cached; })
        .catch(() => cached ?? [])
        .finally(() => { loading = null; });
    return loading;
}

// ბანკის ველი: ადრე ჩაწერილ ბანკებს ჩამოსაშლელ სიაში სთავაზობს, ახალსაც იღებს.
export default function BankNameInput({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
    const listId = useId();
    const [banks, setBanks] = useState<string[]>(cached ?? []);

    useEffect(() => {
        let active = true;
        void loadBanks().then(list => { if (active) setBanks(list); });
        return () => { active = false; };
    }, []);

    return <>
        <input value={value} list={listId} autoComplete="off" maxLength={100}
            placeholder={banks.length ? "აირჩიეთ ან ჩაწერეთ" : undefined}
            onChange={event => onChange(event.target.value)}
            onBlur={() => {
                const clean = value.replace(/\s+/gu, " ").trim();
                const known = banks.find(bank => bank.toLowerCase() === clean.toLowerCase());
                if ((known ?? clean) !== value) onChange(known ?? clean);
            }}
            className={className} />
        <datalist id={listId}>{banks.map(bank => <option key={bank.toLowerCase()} value={bank} />)}</datalist>
    </>;
}
