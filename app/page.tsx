import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import OrderFlowOneTap from "@/components/landing/OrderFlowOneTap";
import FeaturesBento from "@/components/landing/FeaturesBento";

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      <Hero />
      <OrderFlowOneTap />
      <FeaturesBento />
    </main>
  );
}
