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
          size={200}
          level="M"
          bgColor="#ffffff"
          fgColor="#0a0a0f"
          className="h-[160px] w-[160px] sm:h-[180px] sm:w-[180px] md:h-[200px] md:w-[200px]"
        />
      </div>
    </div>
  );
}
