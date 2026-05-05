import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { WalletButton } from "@/components/wallet/WalletButton";
import { useWalletStore } from "@/stores/wallet-store";
import { cn } from "@/lib/utils";

const NAV_SECTIONS = [
  { label: "Features", href: "#features", id: "features" },
  { label: "How it works", href: "#how-it-works", id: "how-it-works" },
  { label: "Pricing", href: "#pricing", id: "pricing" },
] as const;

export default function LandingNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const [heroVisible, setHeroVisible] = useState(true);
  const { isConnected, connect } = useWalletStore();
  const navigate = useNavigate();
  const location = useLocation();

  const closeMenu = () => setMobileOpen(false);

  const handleGetStarted = () => {
    closeMenu();
    if (isConnected) {
      navigate("/dashboard");
    } else {
      connect();
    }
  };

  // Scroll-spy: highlight nav link for the section in the top third of the viewport
  useEffect(() => {
    const sectionIds = NAV_SECTIONS.map((s) => s.id);
    const observers = sectionIds.map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { rootMargin: "-20% 0px -70% 0px" },
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach((o) => o?.disconnect());
  }, []);

  // Hide "Get Started" while the hero is in the viewport — eliminates duplicate CTA
  useEffect(() => {
    const hero = document.getElementById("main-content");
    if (!hero) return;
    const obs = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    obs.observe(hero);
    return () => obs.disconnect();
  }, []);

  // Close mobile nav on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [mobileOpen]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <header aria-label="Site header" className="fixed top-0 inset-x-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-14 sm:h-16 items-center justify-between">
        {/* Logo */}
        <Link
          to="/"
          onClick={() => { if (location.pathname === "/") window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className="flex items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <img
            src="/favicon.png"
            className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-xl object-contain"
            alt="sBTC Pay home"
          />
          <span className="text-base font-bold leading-none">sBTC Pay</span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Main navigation" className="hidden md:flex items-center gap-8 text-body-sm text-muted-foreground">
          {NAV_SECTIONS.map((s) => (
            <a
              key={s.id}
              href={s.href}
              className={cn(
                "transition-colors hover:text-foreground",
                activeSection === s.id ? "text-foreground font-medium" : "",
              )}
            >
              {s.label}
            </a>
          ))}
          <Link to="/docs" className="hover:text-foreground transition-colors">Docs</Link>
        </nav>

        {/* Desktop wallet + CTA */}
        <div className="hidden md:flex items-center gap-2.5">
          <AnimatePresence>
            {!heroVisible && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <Button size="sm" onClick={handleGetStarted}>
                  {isConnected ? "Dashboard" : "Get Started"}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <WalletButton />
        </div>

        {/* Mobile hamburger — 44 × 44px touch target per WCAG 2.5.5 */}
        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          className="md:hidden inline-flex items-center justify-center rounded-md h-11 w-11 -mr-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            aria-label="Mobile navigation"
            className="md:hidden border-t border-border/50 bg-background overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="container flex flex-col py-3 gap-1">
              {NAV_SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={s.href}
                  onClick={closeMenu}
                  className="py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center"
                >
                  {s.label}
                </a>
              ))}
              <Link to="/docs" onClick={closeMenu} className="py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center">Docs</Link>
              <div className="pt-3 border-t border-border/50 flex flex-col gap-2">
                <Button className="w-full" onClick={handleGetStarted}>
                  {isConnected ? "Open Dashboard" : "Get Started"}
                </Button>
                <WalletButton />
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
