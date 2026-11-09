"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/shared/Icon";

import { authPrimaryButtonClass } from "@/components/auth/AuthShell";

const navigation = [
  { label: "მთავარი", href: "/", icon: "solar:home-2-bold-duotone" },
  { label: "ფასები", href: "/pricing", icon: "solar:tag-price-bold-duotone" },
  { label: "შესაძლებლობები", href: "/features", icon: "solar:widget-5-bold-duotone" },
];

// These pages mount their own Header. Keep the previous destination across
// client navigation so the new header can finish the same sliding motion.
let previousNavigationHref: string | null = null;

export default function Header() {
  const pathname = usePathname();
  const desktopNav = useRef<HTMLElement>(null);
  const activeBackground = useRef<HTMLSpanElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const loginPanel = useRef<HTMLDivElement>(null);
  const loginOpener = useRef<HTMLElement | null>(null);

  const closeMenu = () => setMenuOpen(false);

  const openLogin = () => {
    loginOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setLoginOpen(true);
  };

  useLayoutEffect(() => {
    const previousHref = previousNavigationHref;
    previousNavigationHref = navigation.some(item => item.href === pathname) ? pathname : null;

    if (!previousHref || previousHref === pathname || !window.matchMedia("(min-width: 768px) and (prefers-reduced-motion: no-preference)").matches) return;

    const links = desktopNav.current?.querySelectorAll<HTMLAnchorElement>("a");
    const previous = Array.from(links ?? []).find(link => link.getAttribute("href") === previousHref);
    const current = Array.from(links ?? []).find(link => link.getAttribute("href") === pathname);
    const background = activeBackground.current;
    if (!previous || !current || !background) return;

    const from = previous.getBoundingClientRect();
    const to = current.getBoundingClientRect();
    background.animate([
      { transform: `translateX(${from.left - to.left}px)`, width: `${from.width}px` },
      { transform: "translateX(0)", width: `${to.width}px` },
    ], { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  }, [pathname]);

  // Escape ჯერ ფანჯარას ხურავს, მერე მენიუს.
  useEffect(() => {
    if (!menuOpen && !loginOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      // ღია ფანჯარაში Tab ფოკუსს ფანჯრის ღილაკებს შორის ატრიალებს და ფონზე არ გადის.
      if (event.key === "Tab" && loginOpen && loginPanel.current) {
        const focusable = Array.from(loginPanel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const inside = loginPanel.current.contains(document.activeElement);
        if (event.shiftKey && (!inside || document.activeElement === first)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }
      if (event.key !== "Escape") return;
      if (loginOpen) setLoginOpen(false);
      else setMenuOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, loginOpen]);

  // გახსნისას ფოკუსი ფანჯარაში გადადის, დახურვისას გამხსნელ ღილაკს უბრუნდება.
  useEffect(() => {
    if (loginOpen) {
      loginPanel.current?.querySelector<HTMLElement>("a[href]")?.focus();
      return;
    }
    const opener = loginOpener.current;
    loginOpener.current = null;
    if (opener?.isConnected && !opener.closest("[inert]")) opener.focus();
  }, [loginOpen]);

  return (
    <>
      <header className="sticky top-0 z-50">
        {/* The installed app draws under the status bar; the safe-area inset keeps the header below the clock.
            The bar keeps the night colours in both modes; a solid colour also lets iOS tint the status bar without blur. */}
        <div className="relative z-10 border-b border-white/[0.08] bg-[#081F46] pt-[env(safe-area-inset-top,0px)]">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link
              href="/"
              onClick={closeMenu}
              aria-label="MARTEO.GE"
              className="shrink-0"
            >
              <img
                src="/images/logo.svg"
                alt="MARTEO.GE"
                className="h-11 w-auto"
              />
            </Link>

            <nav ref={desktopNav} aria-label="მთავარი ნავიგაცია" className="hidden items-center gap-2 md:flex">
              {navigation.map(item => (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={`relative inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium transition-colors motion-reduce:transition-none ${pathname === item.href ? "text-white" : "text-[#f8fafc] hover:text-[#5a8dee]"}`}
                >
                  {pathname === item.href && <span ref={activeBackground} aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full bg-white/10 ring-1 ring-inset ring-white/10" />}
                  <span className="relative">{item.label}</span>
                </Link>
              ))}
            </nav>

            <div className="hidden md:block">
              <button
                type="button"
                onClick={openLogin}
                className="min-h-10 cursor-pointer rounded-xl bg-[#5a8dee] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#6d9af2]"
              >
                შესვლა
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMenuOpen(open => !open)}
              aria-label={menuOpen ? "მენიუს დახურვა" : "მენიუს გახსნა"}
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-menu"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-[#f8fafc] transition-colors hover:bg-white/10 md:hidden"
            >
              <Icon
                icon={menuOpen ? "solar:close-circle-linear" : "solar:hamburger-menu-linear"}
                className="h-6 w-6"
              />
            </button>
          </div>
        </div>

        {/* მობილური მენიუ ჰედერის უკნიდან ჩამოდის და გვერდს ზემოდან ეფარება. */}
        <div
          id="landing-mobile-menu"
          inert={!menuOpen}
          className={`landing-header-surface absolute inset-x-0 top-full z-0 border-b border-border bg-background shadow-[0_1.5rem_3rem_-1.5rem_rgb(15_28_46/0.35)] transition-[translate,opacity,visibility] duration-300 ease-out md:hidden ${
            menuOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-full opacity-0"
          }`}
        >
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6">
            {navigation.map(item => (
              <Link
                key={item.label}
                href={item.href}
                onClick={closeMenu}
                aria-current={pathname === item.href ? "page" : undefined}
                className={`flex h-12 items-center gap-3 rounded-2xl px-3 text-sm font-medium ${pathname === item.href ? "bg-accent/10 text-accent ring-1 ring-inset ring-accent/15" : "text-text-primary hover:bg-accent/10 hover:text-accent"}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Icon icon={item.icon} className="h-5 w-5" />
                </span>
                {item.label}
              </Link>
            ))}

            <button
              type="button"
              onClick={openLogin}
              className={`mt-2 ${authPrimaryButtonClass}`}
            >
              <Icon icon="solar:login-3-linear" className="h-5 w-5" />
              შესვლა
            </button>
          </nav>
        </div>
      </header>

      {/* მენიუს ქვეშ გვერდი მუქდება; შეხებით მენიუ იხურება. */}
      <div
        aria-hidden="true"
        onClick={closeMenu}
        className={`fixed inset-0 z-40 bg-[var(--marteo-overlay)] transition-opacity duration-300 md:hidden ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center bg-[var(--marteo-overlay)] px-4 backdrop-blur-sm transition-opacity duration-200 ${
          loginOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        aria-hidden={!loginOpen}
        inert={!loginOpen}
        onClick={() => setLoginOpen(false)}
      >
        <div
          className={`w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl transition-transform duration-200 ease-out sm:p-6 ${
            loginOpen ? "translate-y-0 scale-100" : "translate-y-2 scale-95"
          }`}
          ref={loginPanel}
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Icon icon="solar:user-circle-bold-duotone" className="h-6 w-6" />
            </span>

            <button
              type="button"
              onClick={() => setLoginOpen(false)}
              aria-label="ფანჯრის დახურვა"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-text-secondary transition-colors hover:bg-background hover:text-text-primary"
            >
              <Icon icon="solar:close-circle-linear" className="h-6 w-6" />
            </button>
          </div>

          <h2
            id="login-modal-title"
            className="mt-4 text-xl font-semibold text-text-primary"
          >
            მოგესალმებით MARTEO-ში
          </h2>

          <div className="mt-6 grid gap-3">
            <Link
              href="/login"
              onClick={() => setLoginOpen(false)}
              className={authPrimaryButtonClass}
            >
              შესვლა
            </Link>

            <Link
              href="/register"
              onClick={() => setLoginOpen(false)}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-text-primary transition-colors hover:border-accent/40 hover:text-accent"
            >
              რეგისტრაცია
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
