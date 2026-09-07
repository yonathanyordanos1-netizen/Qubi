"use client";

import { motion } from "framer-motion";
import { CameraIcon, TrendingUpIcon, TrophyIcon } from "lucide-react";

const items = [
  {
    icon: CameraIcon,
    title: "Photo Proof Verification",
    desc: "Snap and upload a picture of your activity space or finished task to confirm completion and keep your streak alive.",
    glow: "bg-[#FFF3E8] text-[#F97316]",
  },
  {
    icon: TrendingUpIcon,
    title: "XP & Rank Progression",
    desc: "Earn experience points for every verified habit, climb through rank tiers, and visually track your growth over time.",
    glow: "bg-[#FFFBEB] text-[#E8930C]",
  },
  {
    icon: TrophyIcon,
    title: "Competitive Leaderboards",
    desc: "Compete with friends and early adopters on real-time leaderboards to see who holds the highest rank and strongest discipline.",
    glow: "bg-[#F0F9FF] text-[#0EA5E9]",
  },
];

const EASE = [0.22, 1, 0.36, 1] as const;

const gridStagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
};

const card = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease: EASE },
  },
};

export default function Features() {
  return (
    <motion.section
      variants={gridStagger}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      className="mx-auto w-full max-w-5xl px-6 pb-24 pt-16"
    >
      <motion.div variants={card} className="mb-12 text-center">
        <h2
          className="text-2xl font-bold tracking-tight text-[var(--color-ink)] sm:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          How Qubi keeps you in the <span className="font-serif italic font-normal text-[var(--color-primary)]">game</span>
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-[var(--color-muted)] sm:text-base">
          Three systems that turn consistency into a streak you can't break.
        </p>
      </motion.div>

      <div className="grid gap-10 pt-4 sm:grid-cols-3 sm:gap-6">
        {items.map((item) => (
          <motion.div key={item.title} variants={card} className="group">
            <div className="feature-card relative flex h-full flex-col items-center px-6 pb-7 pt-12 text-center">
              {/* Overlapping circular icon badge */}
              <div className="icon-badge absolute -top-6 left-1/2 grid size-14 -translate-x-1/2 place-items-center">
                <span className={`grid size-10 place-items-center rounded-full ${item.glow}`}>
                  <item.icon className="size-5" />
                </span>
              </div>
              <h3
                className="text-lg font-bold text-[var(--color-ink)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{item.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}