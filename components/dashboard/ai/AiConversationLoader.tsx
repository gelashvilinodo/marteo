import { MarteoAvatar } from "@/components/support/SupportAvatar";

// ისტორიიდან არჩეული ჩათის ჩატვირთვისას ჩანს: მართეოს ლოგო და მის გარშემო მბრუნავი რგოლი.
export default function AiConversationLoader() {
    return (
        <div role="status" className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
            <span className="relative flex h-[72px] w-[72px] items-center justify-center">
                <span aria-hidden="true" className="absolute inset-0 rounded-full border-[3px] border-accent/15" />
                <span aria-hidden="true" className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-accent motion-reduce:animate-none" />
                <MarteoAvatar size="lg" />
            </span>
            <span className="text-sm text-text-secondary">ჩათი იტვირთება…</span>
        </div>
    );
}
