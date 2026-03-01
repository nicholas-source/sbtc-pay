import { useState } from "react";
import { Link } from "react-router-dom";
import { Bitcoin, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { WalletButton } from "@/components/wallet/WalletButton";

export default function LandingNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMenu = () => setMobileOpen(false);

  return (
    <header aria-label="Site header" className="fixed top-0 inset-x-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Bitcoin className="h-4.5 w-4.5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold">sBTC Pay</span>
        </Link>
        <nav aria-label="Main navigation" className="hidden md:flex items-center gap-8 text-body-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          <Link to="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <WalletButton />
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            aria-label="Mobile navigation"
            className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="container flex flex-col py-2">
              <a href="#features" onClick={closeMenu} className="py-3 text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#pricing" onClick={closeMenu} className="py-3 text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
              <Link to="/dashboard" onClick={closeMenu} className="py-3 text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</Link>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
