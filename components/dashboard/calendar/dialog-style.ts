// კალენდრის dialog-ები: დესკტოპზე ცენტრში, ტელეფონზე ქვემოდან ამოსული sheet.
// iPhone-ის ქვედა ზოლის (safe area) დაშორება ფანჯარაზე კი არა, მის ბოლო ბლოკზეა (sheetBottomPad):
// ფანჯრის padding-ზე მიმაგრებული ღილაკების ზოლი ზემოთ ჩერდებოდა და ქვემოთ შიგთავსი ჩანდა.
export const calendarDialogClass = [
    "calendar-sheet m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto overscroll-contain",
    "rounded-2xl border border-border bg-surface p-0 text-left text-text-primary",
    "backdrop:bg-black/40 backdrop:backdrop-blur-sm",
    "max-sm:mb-0 max-sm:max-h-[calc(100dvh-3rem)] max-sm:w-full max-sm:max-w-full",
    "max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0",
].join(" ");

// ბოლო ბლოკის (მიმაგრებული ღილაკები ან შიგთავსი) ქვედა დაშორება ტელეფონზე: ჩვეულებრივი + safe area.
export const sheetBottomPad = "max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))]";
