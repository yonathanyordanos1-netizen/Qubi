"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setInvalid(false);
    if (!EMAIL_RE.test(email)) {
      setInvalid(true);
      inputRef.current?.focus();
      toast.error("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("You're on the list! We'll be in touch.");
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 }, zIndex: 9999 });
      setEmail("");
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }, [email]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.35, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const }}
      className="glass-card mx-auto w-full max-w-lg p-5 sm:p-6"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row" noValidate>
        <label htmlFor="waitlist-email" className="sr-only">
          Email address
        </label>
        <Input
          ref={inputRef}
          id="waitlist-email"
          type="email"
          placeholder="you@company.com"
          required
          className="h-12 flex-1 rounded-2xl border border-[var(--color-border)] bg-white/80 px-4 text-[var(--color-ink)] placeholder:text-[var(--color-muted-soft)] transition-all focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/15 disabled:cursor-not-allowed disabled:opacity-50"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (invalid) setInvalid(false);
          }}
        />
        <Button
          type="submit"
          disabled={loading}
          className="h-12 rounded-2xl bg-[var(--color-primary)] px-7 text-sm font-semibold text-white shadow-lg shadow-[var(--color-primary)]/25 transition-all hover:bg-[var(--color-primary-deep)] hover:shadow-xl hover:shadow-[var(--color-primary)]/30 active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? "Joining…" : "Join Waitlist"}
        </Button>
      </form>

      {invalid && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-xs text-[var(--color-error)]"
        >
          Please enter a valid email address.
        </motion.p>
      )}

      {/* Social proof */}
      <div className="mt-5 flex items-center justify-center gap-3 text-sm text-[var(--color-muted)]">
        <div className="flex -space-x-2.5">
          {["/avatars/person-1.jpg", "/avatars/person-2.jpg", "/avatars/person-3.jpg"].map((src) => (
            <motion.div
              key={src}
              whileHover={{ scale: 1.15 }}
              className="size-8 overflow-hidden rounded-full border-2 border-white shadow-sm ring-1 ring-black/[0.04]"
            >
              <Image
                src={src}
                alt=""
                width={32}
                height={32}
                className="size-full object-cover"
              />
            </motion.div>
          ))}
        </div>
        <span>Join 500+ early adopters</span>
      </div>
    </motion.div>
  );
}