"use client";

import { useEffect, useRef } from "react";

type Options = { open: boolean; dirty: boolean; canLeave: () => boolean; leave: () => void };
export function useOrderLeaveGuard({ open, dirty, canLeave, leave }: Options) {
    const actions = useRef({ canLeave, leave });
    useEffect(() => { actions.current = { canLeave, leave }; }, [canLeave, leave]);
    useEffect(() => {
        if (!dirty) return;
        const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", unload);
        return () => window.removeEventListener("beforeunload", unload);
    }, [dirty]);
    useEffect(() => {
        if (!dirty) return;
        const click = (event: MouseEvent) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
            const link = event.target.closest<HTMLAnchorElement>("a[href]");
            if (!link || link.hasAttribute("download") || link.target && link.target !== "_self") return;
            const target = new URL(link.href, window.location.href);
            if (target.origin !== window.location.origin || target.pathname === location.pathname && target.search === location.search) return;
            if (!actions.current.canLeave()) { event.preventDefault(); event.stopImmediatePropagation(); }
            else actions.current.leave();
        };
        document.addEventListener("click", click, true);
        return () => document.removeEventListener("click", click, true);
    }, [dirty]);
    useEffect(() => {
        if (!open) return;
        // Back პირველად დახურავს ფანჯარას; Next-ის ისტორიის მონაცემებს ვინარჩუნებთ.
        const url = window.location.href;
        const state = window.history.state;
        const key = crypto.randomUUID();
        window.history.pushState({ ...state, marteoOrderDialog: key }, "", url);
        const pop = (event: PopStateEvent) => {
            if (event.state?.marteoOrderDialog === key) return;
            if (!actions.current.canLeave()) {
                event.stopImmediatePropagation();
                window.history.pushState({ ...state, marteoOrderDialog: key }, "", url);
                return;
            }
            if (window.location.href === url) event.stopImmediatePropagation();
            actions.current.leave();
        };
        window.addEventListener("popstate", pop, true);
        return () => {
            window.removeEventListener("popstate", pop, true);

            if (
                window.history.state?.marteoOrderDialog === key &&
                window.location.href === url
            ) {
                window.history.replaceState(state, "", url);
            }
        };
    }, [open]);
}
