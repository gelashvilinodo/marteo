export default function PurchasesLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="შესყიდვები იტვირთება"
      className="p-4 sm:p-6 lg:p-8"
    >
      <span role="status" className="sr-only">
        შესყიდვები იტვირთება
      </span>

      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold text-text-primary">
            შესყიდვები
          </h1>

          <div
            aria-hidden="true"
            className="h-11 w-full animate-pulse rounded-xl bg-success/20 motion-reduce:animate-none sm:w-44"
          />
        </div>

        <div aria-hidden="true" className="mt-6 space-y-4">
          {[0, 1, 2].map((card) => (
            <div
              key={card}
              className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"
            >
              <div className="animate-pulse motion-reduce:animate-none">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="h-7 w-14 rounded-lg bg-accent/10" />
                      <div className="h-5 w-28 rounded-md bg-border/60" />
                    </div>

                    <div className="mt-2 h-4 w-20 rounded-md bg-border/40" />
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <div className="h-11 w-11 rounded-xl bg-border/40" />
                    <div className="h-11 w-11 rounded-xl bg-border/40" />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-2">
                    {[0, 1, 2].map((photo) => (
                      <div
                        key={photo}
                        className="h-12 w-12 rounded-xl bg-border/40 sm:h-14 sm:w-14"
                      />
                    ))}
                  </div>

                  <div className="h-5 w-32 rounded-md bg-border/40" />
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="h-4 w-36 rounded-md bg-border/40" />

                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="h-4 w-28 rounded-md bg-border/40" />
                    <div className="h-6 w-24 rounded-md bg-border/60" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}