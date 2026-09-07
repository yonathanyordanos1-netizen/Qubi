import Background from "@/components/landing/background";
import SiteHeader from "@/components/landing/header";
import Hero from "@/components/landing/hero";
import WaitlistForm from "@/components/landing/waitlist-form";
import Features from "@/components/landing/features";
import { Toaster } from "@/components/ui/sonner";

export default function Home() {
  return (
    <>
      <Background />
      <Toaster richColors position="top-center" />
      <div className="relative flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 pt-14 sm:pt-20">
          <Hero />
          <div className="mt-4 w-full">
            <WaitlistForm />
          </div>
        </main>
        <Features />
        <footer className="border-t border-[var(--color-border)] py-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 text-xs text-[var(--color-muted-soft)]">
            <span>© {new Date().getFullYear()} Qubi</span>
            <span>
              Built with <span className="text-[var(--color-primary)]">♥</span>
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}