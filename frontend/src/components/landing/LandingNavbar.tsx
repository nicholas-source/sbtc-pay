import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bitcoin, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { WalletButton } from "@/components/wallet/WalletButton";

export default function LandingNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMenu = () => setMobileOpen(false);

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
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-primary">
            <Bitcoin className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-base font-bold leading-none">sBTC Pay</span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Main navigation" className="hidden md:flex items-center gap-8 text-body-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          <Link to="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
        </nav>

        {/* Desktop wallet (hidden on mobile) */}
        <div className="hidden md:flex items-center gap-2">
          <WalletButton />
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          className="md:hidden inline-flex items-center justify-center rounded-md h-10 w-10 -mr-2 text-muted-foreground hover:text-foreground transition-colors"
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
              <a href="#features" onClick={closeMenu} className="py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center">Features</a>
              <a href="#pricing" onClick={closeMenu} className="py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center">Pricing</a>
              <Link to="/dashboard" onClick={closeMenu} className="py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center">Dashboard</Link>
              <div className="pt-3 border-t border-border/50">
                <WalletButton />
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
