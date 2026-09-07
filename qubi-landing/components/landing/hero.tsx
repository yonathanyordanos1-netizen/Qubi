"use client";

import { motion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

const stagger = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.15 + i * 0.07, duration: 0.65, ease: EASE },
  }),
};

export default function Hero() {
  return (
    <section className="flex flex-col items-center text-center px-6 pt-10 pb-2">
      <motion.div
        initial="hidden"
        animate="visible"
        className="flex flex-col items-center gap-5"
      >
        {/* Status badge */}
        <motion.div variants={stagger} custom={0}>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-1.5 text-sm font-medium text-[var(--color-muted)] shadow-sm backdrop-blur-sm">
            <span className="size-2 animate-pulse-glow rounded-full bg-[var(--color-success)]" />
            ✦ Beta goes live soon
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={stagger}
          custom={1}
          className="max-w-xl text-4xl font-extrabold leading-[1.08] tracking-tight text-[var(--color-ink)] sm:text-5xl lg:text-[3.5rem]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Turn your daily habits into an unbeatable <span className="font-serif italic font-normal text-[var(--color-primary)]">streak</span>.{" "}
        </motion.h1>

        {/* Subtext */}
        <motion.p
          variants={stagger}
          custom={2}
          className="max-w-md text-base leading-relaxed text-[var(--color-muted)] sm:text-lg"
        >
          Qubi gamifies your daily routines with XP, ranks, and live leaderboards. Upload photo proof of your completed tasks, stay accountable, and level up your life in real time.
        </motion.p>
      </motion.div>
    </section>
  );
}