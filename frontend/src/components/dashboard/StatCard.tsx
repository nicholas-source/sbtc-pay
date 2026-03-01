import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number;
  displayValue: string;
  unit?: string;
  usd?: string;
  icon: LucideIcon;
  change: string;
}

function useCountUp(target: number, enabled: boolean, duration = 1200) {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!enabled) return;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, enabled]);

  return current;
}

export default function StatCard({ label, value, displayValue, unit, usd, icon: Icon, change }: StatCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const animated = useCountUp(value, isVisible);
  const formattedValue = value > 1000
    ? animated.toLocaleString()
    : animated.toString();

  return (
    <Card
      ref={cardRef}
      className="group card-glow card-glow-hover card-glow-animated transition-all duration-300 hover:scale-[1.02]"
      aria-label={`${label}: ${displayValue}${unit ? ` ${unit}` : ''}`}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-body-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:scale-110" />
      </CardHeader>
      <CardContent>
        <div className="font-mono-nums text-sats text-foreground">
          {formattedValue}
          {unit && <span className="ml-1 text-caption text-muted-foreground">{unit}</span>}
        </div>
        <div className="mt-1 flex items-center gap-2 text-caption">
          {usd && <span className="text-muted-foreground">{usd}</span>}
          <span className="text-success">{change}</span>
        </div>
      </CardContent>
    </Card>
  );
}
