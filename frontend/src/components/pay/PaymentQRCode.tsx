import { QRCodeSVG } from "qrcode.react";

interface Props {
  address: string;
}

export function PaymentQRCode({ address }: Props) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-lg bg-white p-2.5 sm:p-3">
        <QRCodeSVG
          value={address}
          size={140}
          level="M"
          bgColor="#ffffff"
          fgColor="#0a0a0f"
          className="h-[110px] w-[110px] sm:h-[140px] sm:w-[140px]"
        />
      </div>
    </div>
  );
}
