import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/layout/PageTransition";
import { Bitcoin, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

function NotFound() {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <PageTransition>
      <div className="flex min-h-screen items-center justify-center bg-background bg-grid p-6">
        <div className="text-center space-y-6 max-w-md">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Bitcoin className="h-8 w-8 text-primary" />
            </div>
          </div>

          <motion.h1
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="text-7xl font-bold text-gradient-orange"
          >
            404
          </motion.h1>

          <div className="space-y-2">
            <p className="text-heading-sm text-foreground">Page not found</p>
            <p className="text-body-sm text-muted-foreground">
              The page <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-primary text-xs">{location.pathname}</code> doesn't exist or has been moved.
            </p>
          </div>

          <Button asChild>
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
          </Button>
        </div>
      </div>
    </PageTransition>
  );
}
export default NotFound;
