"use client";

import { useEffect, useState } from "react";

function CloudBlob({
  className,
  delay = 0,
  size = 400,
}: {
  className?: string;
  delay?: number;
  size?: number;
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let raf: number;
    let t = 0;
    const tick = () => {
      t += 0.002;
      setPos({
        x: Math.sin(t * 0.4 + delay) * 0.08,
        y: Math.cos(t * 0.3 + delay) * 0.06,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [delay]);

  return (
    <div
      className={`absolute rounded-full blur-3xl opacity-50 ${className}`}
      style={{
        width: size,
        height: size,
        transform: `translate(${pos.x * 100}px, ${pos.y * 100}px)`,
        transition: "transform 0.1s linear",
      }}
    />
  );
}

export default function Background() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* Warm cream base */}
      <div className="absolute inset-0 bg-[#FFF9F3]" />

      {/* Soft radial gradients for depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(249,115,22,0.08),transparent),radial-gradient(ellipse_60%_50%_at_80%_100%,rgba(14,165,233,0.06),transparent),radial-gradient(ellipse_50%_40%_at_10%_80%,rgba(255,197,49,0.05),transparent)]" />

      {/* Subtle noise texture overlay */}
      <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")" }} />

      {/* Cloud blobs */}
      <CloudBlob className="bg-[#F97316]/[0.06]" delay={0} size={500} />
      <CloudBlob className="bg-[#0EA5E9]/[0.05]" delay={2} size={450} />
      <CloudBlob className="bg-[#FFC531]/[0.05]" delay={4} size={400} />

      {/* Soft vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(249,115,22,0.03)_100%)]" />
    </div>
  );
}