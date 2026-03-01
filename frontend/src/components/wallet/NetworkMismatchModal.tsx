import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, ArrowRight, Network, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NETWORK_MODE } from "@/lib/stacks/config";

interface NetworkMismatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
  detectedNetwork: "mainnet" | "testnet";
}

export function NetworkMismatchModal({
  isOpen,
  onClose,
  onRetry,
  detectedNetwork,
}: NetworkMismatchModalProps) {
  const expectedNetwork = NETWORK_MODE;
  const isMainnetDetected = detectedNetwork === "mainnet";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4"
          >
            <div className="relative overflow-hidden rounded-2xl border border-destructive/30 bg-card shadow-2xl">
              {/* Gradient top border */}
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-destructive via-orange-500 to-destructive" />

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute right-4 top-4 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="p-6 pt-8">
                {/* Icon */}
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 ring-4 ring-destructive/20">
                  <motion.div
                    animate={{ 
                      rotate: [0, -10, 10, -10, 0],
                    }}
                    transition={{ 
                      duration: 0.5,
                      delay: 0.2,
                    }}
                  >
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                  </motion.div>
                </div>

                {/* Title */}
                <h2 className="text-center text-heading-sm text-foreground mb-2">
                  Wrong Network Detected
                </h2>

                {/* Description */}
                <p className="text-center text-body-sm text-muted-foreground mb-6">
                  You're trying to connect with a{" "}
                  <span className={`font-semibold ${isMainnetDetected ? "text-green-500" : "text-orange-500"}`}>
                    {detectedNetwork}
                  </span>{" "}
                  wallet, but sBTC Pay is currently running on{" "}
                  <span className="font-semibold text-orange-500">{expectedNetwork}</span>.
                </p>

                {/* Network comparison */}
                <div className="mb-6 rounded-lg bg-muted/50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    {/* Detected */}
                    <div className="flex-1 text-center">
                      <div className="mb-2 flex items-center justify-center gap-2">
                        <Network className="h-4 w-4 text-destructive" />
                        <span className="text-caption font-medium text-muted-foreground">
                          Your Wallet
                        </span>
                      </div>
                      <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-body-sm font-semibold ${
                        isMainnetDetected 
                          ? "bg-green-500/10 text-green-500 ring-1 ring-green-500/30" 
                          : "bg-orange-500/10 text-orange-500 ring-1 ring-orange-500/30"
                      }`}>
                        <span className="relative flex h-2 w-2">
                          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${isMainnetDetected ? "bg-green-400" : "bg-orange-400"} opacity-75`} />
                          <span className={`relative inline-flex h-2 w-2 rounded-full ${isMainnetDetected ? "bg-green-500" : "bg-orange-500"}`} />
                        </span>
                        {detectedNetwork === "mainnet" ? "Mainnet" : "Testnet"}
                      </div>
                    </div>

                    {/* Arrow */}
                    <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />

                    {/* Expected */}
                    <div className="flex-1 text-center">
                      <div className="mb-2 flex items-center justify-center gap-2">
                        <Network className="h-4 w-4 text-primary" />
                        <span className="text-caption font-medium text-muted-foreground">
                          Required
                        </span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-3 py-1 text-body-sm font-semibold text-orange-500 ring-1 ring-orange-500/30">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                        </span>
                        Testnet
                      </div>
                    </div>
                  </div>
                </div>

                {/* Instructions */}
                <div className="mb-6 space-y-3 text-body-sm">
                  <p className="font-medium text-foreground">To connect properly:</p>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li>Open your wallet extension (Leather, Xverse, etc.)</li>
                    <li>
                      Switch to <span className="font-semibold text-orange-500">Testnet</span> network
                    </li>
                    <li>Click "Try Again" below to reconnect</li>
                  </ol>
                </div>

                {/* Wallet-specific help */}
                <details className="mb-6 rounded-lg border border-border bg-muted/30">
                  <summary className="cursor-pointer px-4 py-3 text-body-sm font-medium text-foreground hover:text-primary transition-colors">
                    How to switch networks in popular wallets
                  </summary>
                  <div className="border-t border-border px-4 py-3 space-y-4 text-body-sm text-muted-foreground">
                    <div>
                      <p className="font-medium text-foreground mb-1">Leather Wallet:</p>
                      <p>Click the network indicator at the top → Select "Testnet"</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground mb-1">Xverse Wallet:</p>
                      <p>Settings → Network → Switch to "Testnet"</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground mb-1">Asigna Wallet:</p>
                      <p>Menu → Settings → Network → "Testnet"</p>
                    </div>
                  </div>
                </details>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={onClose}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 gap-2"
                    onClick={onRetry}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Try Again
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
