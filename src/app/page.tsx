import {
  LandingNav,
  HeroSection,
  FeatureCategories,
  HowItWorks,
  Benefits,
  FAQ,
  FinalCTA,
  LandingFooter,
} from "@/components/landing"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <LandingNav />
      <main>
        <HeroSection />
        <FeatureCategories />
        <HowItWorks />
        <Benefits />
        <FAQ />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  )
}
