export default function PublicOrderNotFound() {
    return (
        <main className="flex min-h-dvh items-center justify-center bg-background p-4 text-text-primary">
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
                <h1 className="text-xl font-semibold">შეკვეთის ინფორმაცია აღარ არის ხელმისაწვდომი</h1>
                <p className="mt-3 text-sm text-text-secondary">
                    ბმული არასწორია ან გაუქმებულია. დეტალებისთვის დაუკავშირდით მაღაზიას.
                </p>
            </div>
        </main>
    );
}
