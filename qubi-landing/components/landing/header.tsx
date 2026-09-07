"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--color-border)] bg-[#FFF9F3]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
        <Link href="/" aria-label="Qubi home" className="flex items-center gap-3">
          <span className="relative size-11 shrink-0 overflow-hidden rounded-2xl shadow-md shadow-[var(--color-primary)]/15">
            <Image
              src="/Qubi.jpg"
              alt="Qubi mascot"
              width={44}
              height={44}
              className="object-cover"
              priority
            />
          </span>
          <span
            className="text-lg font-bold tracking-tight text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Qubi
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <motion.a
            href="https://www.tiktok.com/@questify.app1"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Qubi on TikTok"
            className="flex size-9 items-center justify-center text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <TikTokIcon className="size-[18px]" />
          </motion.a>
          <motion.a
            href="https://www.instagram.com/qubi._app"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Qubi on Instagram"
            className="flex size-9 items-center justify-center text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <InstagramIcon className="size-[18px]" />
          </motion.a>
        </div>
      </div>
    </header>
  );
}