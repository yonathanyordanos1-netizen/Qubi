import type { Metadata } from "next";
import { Space_Grotesk, Poppins, Playfair_Display } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const poppins = Poppins({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

const playfair = Playfair_Display({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://qubi-questify.app"),
  title: "Qubi — Turn daily habits into unbeatable streaks.",
  description:
    "Qubi gamifies your daily routines with XP, ranks, and live leaderboards. Upload photo proof of your completed tasks, stay accountable, and level up your life in real time.",
  openGraph: {
    title: "Qubi — Turn daily habits into unbeatable streaks.",
    description:
      "XP, ranks, and live leaderboards for your daily habits. Stay accountable, level up your life.",
    images: [{ url: "/Qubi.jpg" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${poppins.variable} ${playfair.variable}`}
    >
      <body className="min-h-screen">{children}</body>
    </html>
  );
}