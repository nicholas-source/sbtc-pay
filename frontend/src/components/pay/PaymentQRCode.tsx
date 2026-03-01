import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  address: string;
}

export function PaymentQRCode({ address }: Props) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success("Address copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-lg bg-white p-3">
        <QRCodeSVG
          value={address}
          size={150}
          level="M"
          bgColor="#ffffff"
          fgColor="#0a0a0f"
        />
      </div>

      <div className="flex items-center gap-2 w-full max-w-[280px]">
        <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-caption text-muted-foreground font-mono">
          {address}
        </code>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-9 w-9"
          onClick={copyAddress}
        >
          {copied ? (
            <Check className="h-4 w-4 text-success" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
