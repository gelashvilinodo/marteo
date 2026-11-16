import { Block, SkPanel, Text } from "@/components/admin/AdminSkeleton";

// ჩატი მთელ სიმაღლეს იკავებს, ისევე როგორც AdminConversation.
export default function Loading() {
    return <div aria-busy="true" aria-label="იტვირთება" className="-m-4 flex h-[calc(100dvh-4rem)] gap-5 p-3 sm:-m-6 sm:p-5 lg:-m-8 lg:p-6 xl:grid xl:grid-cols-[minmax(0,1fr)_340px]">
        <span role="status" className="sr-only">იტვირთება…</span>
        <div aria-hidden="true" inert className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-surface motion-safe:animate-pulse">
            <div className="flex items-center gap-3 border-b border-border p-4"><Block className="h-10 w-10 rounded-full" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold"><Text>ბიზნესის სახელი</Text></p><p className="mt-1 text-xs"><Text>მფლობელი · ღია</Text></p></div></div>
            <div className="flex flex-1 flex-col justify-end gap-3 p-4">
                {["w-2/3", "ml-auto w-1/2", "w-3/5", "ml-auto w-2/5"].map(width => <Block key={width} className={`h-12 rounded-2xl ${width}`} />)}
            </div>
            <div className="border-t border-border p-3"><Block className="h-12 rounded-2xl" /></div>
        </div>
        <div aria-hidden="true" className="hidden min-w-0 flex-col gap-4 motion-safe:animate-pulse xl:flex">
            <SkPanel title="ანგარიში" rows={4} />
            <SkPanel title="შიდა შენიშვნები" rows={2} />
        </div>
    </div>;
}
