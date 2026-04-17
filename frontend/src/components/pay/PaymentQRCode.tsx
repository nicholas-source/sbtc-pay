import { QRCodeSVG } from "qrcode.react";

interface Props {
  /** The URL or value the QR code should encode */
  value: string;
}

export function PaymentQRCode({ value }: Props) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-lg bg-white p-2.5 sm:p-3">
        <QRCodeSVG
          value={value}
          size={140}
          level="M"
          bgColor="#ffffff"
          fgColor="#0a0a0f"
          className="h-[100px] w-[100px] sm:h-[120px] sm:w-[120px] md:h-[140px] md:w-[140px]"
        />
      </div>
    </div>
  );
}
