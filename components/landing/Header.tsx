"use client";

import Link from "next/link";
import { useState } from "react";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            onClick={closeMenu}
            aria-label="MARTEO.GE"
            className="shrink-0"
          >
            <img
              src="/images/marteo-08.svg"
              alt="MARTEO.GE"
              className="h-14 w-auto dark:hidden"
            />

            <img
              src="/images/logo.svg"
              alt="MARTEO.GE"
              className="hidden h-14 w-auto dark:block"
            />
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <Link
              href="/"
              className="text-sm font-medium text-text-primary transition-colors hover:text-accent"
            >
              მთავარი
            </Link>

            <a
              href="#pricing"
              className="text-sm font-medium text-text-primary transition-colors hover:text-accent"
            >
              ფასები
            </a>

            <Link
              href="/information"
              className="text-sm font-medium text-text-primary transition-colors hover:text-accent"
            >
              ინფორმაცია
            </Link>
          </nav>

          <div className="hidden md:block">
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="cursor-pointer rounded-lg border border-primary bg-primary px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:border-accent hover:bg-accent hover:scale-[1.02]"
            >
              შესვლა
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "მენიუს დახურვა" : "მენიუს გახსნა"}
            aria-expanded={menuOpen}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-text-primary transition-colors hover:bg-primary/5 md:hidden"
          >
            <span className="text-2xl leading-none">
              {menuOpen ? "×" : "☰"}
            </span>
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-border bg-background md:hidden">
            <nav className="mx-auto flex max-w-7xl flex-col px-4 py-4 sm:px-6">
              <Link
                href="/"
                onClick={closeMenu}
                className="rounded-lg px-3 py-3 text-base font-medium text-text-primary transition-colors hover:bg-primary/5 hover:text-accent"
              >
                მთავარი
              </Link>

              <a
                href="#pricing"
                onClick={closeMenu}
                className="rounded-lg px-3 py-3 text-base font-medium text-text-primary transition-colors hover:bg-primary/5 hover:text-accent"
              >
                ფასები
              </a>

              <Link
                href="/information"
                onClick={closeMenu}
                className="rounded-lg px-3 py-3 text-base font-medium text-text-primary transition-colors hover:bg-primary/5 hover:text-accent"
              >
                ინფორმაცია
              </Link>

              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  setLoginOpen(true);
                }}
                className="mt-2 cursor-pointer rounded-lg border border-primary bg-primary px-4 py-3 text-base font-medium text-white transition-all duration-200 hover:border-accent hover:bg-accent"
              >
                შესვლა
              </button>
            </nav>
          </div>
        )}
      </header>

      {loginOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-modal-title"
          onClick={() => setLoginOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between">
              <h2
                id="login-modal-title"
                className="text-xl font-semibold text-text-primary"
              >
                მოგესალმებით MARTEO-ში
              </h2>

              <button
                type="button"
                onClick={() => setLoginOpen(false)}
                aria-label="ფანჯრის დახურვა"
                className="cursor-pointer text-2xl leading-none text-text-secondary transition-colors hover:text-text-primary"
              >
                ×
              </button>
            </div>

            <div className="grid gap-3">
              <Link
                href="/login"
                onClick={() => setLoginOpen(false)}
                className="cursor-pointer rounded-lg bg-primary px-4 py-3 text-center text-sm font-medium text-white transition-all duration-200 hover:bg-accent"
              >
                შესვლა
              </Link>

              <Link
                href="/register"
                onClick={() => setLoginOpen(false)}
                className="cursor-pointer rounded-lg border border-border px-4 py-3 text-center text-sm font-medium text-text-primary transition-all duration-200 hover:border-accent hover:bg-accent/10"
              >
                რეგისტრაცია
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}