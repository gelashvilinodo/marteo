import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import FeaturesBento from "@/components/landing/FeaturesBento";
import OrderFlowOneTap from "@/components/landing/OrderFlowOneTap";
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
      <OrderFlowOneTap />
      <Footer />
    </main>
  );
}
