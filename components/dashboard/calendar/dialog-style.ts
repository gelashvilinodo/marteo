// კალენდრის dialog-ები: დესკტოპზე ცენტრში, ტელეფონზე ქვემოდან ამოსული sheet,
// რომელიც iPhone-ის ქვედა ზოლს (safe area) ითვალისწინებს.
export const calendarDialogClass = [
    "calendar-sheet m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto overscroll-contain",
    "rounded-2xl border border-border bg-surface p-0 text-left text-text-primary",
    "backdrop:bg-black/40 backdrop:backdrop-blur-sm",
    "max-sm:mb-0 max-sm:max-h-[calc(100dvh-3rem)] max-sm:w-full max-sm:max-w-full",
    "max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]",
].join(" ");
