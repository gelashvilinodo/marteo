import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import CapabilitiesFlow from "@/components/landing/CapabilitiesFlow";

export const metadata = {
    title: "შესაძლებლობები - MARTEO",
    description: "როგორ გადის ბიზნესის ერთი ციკლი მართეოში: შესყიდვა, წარმოება, მარაგი, შეკვეთა, მომხმარებელი და მოგება.",
};

export default function FeaturesPage() {
    return (
        <main className="min-h-screen bg-background">
            <Header />

            <section
                aria-labelledby="features-title"
                className="landing-hero landing-hero-page relative isolate overflow-hidden text-white"
            >
                <div aria-hidden="true" className="landing-hero-backdrop">
                    <span className="landing-hero-glow landing-hero-glow-1" />
                    <span className="landing-hero-glow landing-hero-glow-2" />
                </div>

                <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-20 lg:px-8">
                    <p className="text-xs font-semibold tracking-wider text-accent uppercase sm:text-sm">შესაძლებლობები</p>
                    <h1
                        id="features-title"
                        className="mx-auto mt-3 max-w-3xl text-[clamp(1.6rem,6vw,3rem)] leading-tight font-bold text-balance"
                    >
                        თქვენ შეკვეთას ამატებთ, დანარჩენს MARTEO აკეთებს
                    </h1>
                    <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                        ბიზნესის მთელი ციკლი, შესყიდვიდან მოგებამდე, ერთ სისტემაში.
                    </p>
                </div>
            </section>

            <CapabilitiesFlow />

            <Footer />
        </main>
    );
}
