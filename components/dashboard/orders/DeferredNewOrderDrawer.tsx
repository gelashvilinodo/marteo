"use client";

import dynamic from "next/dynamic";
import { useNewOrder } from "./NewOrderProvider";

function LoadingDrawer() {
    const { isOpen, closeNewOrder } = useNewOrder();
    if (!isOpen) return null;
    return <div className="fixed bottom-0 left-0 right-0 top-16 z-30 flex flex-col bg-background text-text-primary lg:left-[280px]">
        <div className="flex items-center justify-between border-b border-border bg-surface p-4">
            <p role="status" className="text-sm text-text-secondary">იტვირთება…</p>
            <button type="button" onClick={closeNewOrder} className="rounded-xl border border-border px-4 py-2 text-sm">დახურვა</button>
        </div>
    </div>;
}

const Drawer = dynamic(() => import("./NewOrderDrawer"), { ssr: false, loading: LoadingDrawer });

export default function DeferredNewOrderDrawer() {
    const { drawerActivated } = useNewOrder();
    // Once opened, retain the mounted drawer so drafts, guards and save state survive closing.
    return drawerActivated ? <Drawer /> : null;
}
