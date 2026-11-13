import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import FeaturesBento from "@/components/landing/FeaturesBento";
import HowItWorks from "@/components/landing/how-it-works/HowItWorks";
import AfterOrder from "@/components/landing/how-it-works/AfterOrder";
import StackScroll from "@/components/landing/how-it-works/StackScroll";
import Footer from "@/components/landing/Footer";

export const metadata = {
  title: "MARTEO - ბიზნესის მართვის პლატფორმა",
  description: "შეკვეთები, მარაგი, შესყიდვები, მომხმარებლები და მოგება ერთ სივრცეში. სცადეთ მართეო 14 დღე უფასოდ.",
};

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      <Hero />
      <FeaturesBento />
      <StackScroll back={<HowItWorks />} front={<AfterOrder />} />
      <Footer />
    </main>
  );
}
