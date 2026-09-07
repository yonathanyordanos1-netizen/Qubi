"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LockIcon, MailIcon, RefreshCwIcon, CopyIcon, CheckIcon, UsersIcon } from "lucide-react";
import { WaitlistEntry } from "@/lib/supabase";

const STORAGE_KEY = "qubi_admin_pass";

export default function AdminPage() {
  const [passcode, setPasscode] = useState("");
  const [savedPasscode, setSavedPasscode] = useState<string | null>(null);
  const [entries, setEntries] = useState<WaitlistEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setSavedPasscode(saved);
      fetchList(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchList = useCallback(async (code: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/waitlist?passcode=${encodeURIComponent(code)}`);
      if (res.status === 401) {
        setError("Wrong passcode. Try again.");
        setSavedPasscode(null);
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch {
      setError("Something went wrong loading the waitlist.");
    } finally {
      setLoading(false);
    }
  }, []);

  const unlock = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!passcode.trim()) return;
      window.localStorage.setItem(STORAGE_KEY, passcode.trim());
      setSavedPasscode(passcode.trim());
      fetchList(passcode.trim());
    },
    [passcode, fetchList],
  );

  const copyEmail = useCallback(async (email: string) => {
    await navigator.clipboard.writeText(email);
    setCopied(email);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  const copyAll = useCallback(async () => {
    if (!entries || entries.length === 0) return;
    await navigator.clipboard.writeText(entries.map((e) => e.email).join("\n"));
    setCopied("all");
    setTimeout(() => setCopied(null), 1500);
  }, [entries]);

  if (!savedPasscode) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <span className="relative size-12 overflow-hidden rounded-2xl shadow-md shadow-[var(--color-primary)]/15">
            <Image src="/Qubi.jpg" alt="Qubi mascot" width={48} height={48} className="object-cover" />
          </span>
          <span className="text-xl font-bold tracking-tight text-[var(--color-ink)]" style={{ fontFamily: "var(--font-display)" }}>
            Qubi Admin
          </span>
        </Link>

        <form
          onSubmit={unlock}
          className="glass-card w-full max-w-sm p-6"
        >
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
              <LockIcon className="size-5" />
            </span>
            <div>
              <h1 className="text-base font-bold text-[var(--color-ink)]" style={{ fontFamily: "var(--font-display)" }}>
                Waitlist Dashboard
              </h1>
              <p className="text-xs text-[var(--color-muted)]">Enter your admin passcode</p>
            </div>
          </div>

          <label htmlFor="passcode" className="sr-only">
            Admin passcode
          </label>
          <input
            id="passcode"
            type="password"
            autoComplete="current-password"
            placeholder="Admin passcode"
            value={passcode}
            onChange={(e) => {
              setPasscode(e.target.value);
              setError("");
            }}
            className="h-12 w-full rounded-2xl border border-[var(--color-border)] bg-white/80 px-4 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted-soft)] transition-all focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/15"
          />

          {error && <p className="mt-2 text-xs text-[var(--color-error)]">{error}</p>}

          <button
            type="submit"
            disabled={loading || !passcode.trim()}
            className="mt-4 h-12 w-full rounded-2xl bg-[var(--color-primary)] text-sm font-semibold text-white shadow-lg shadow-[var(--color-primary)]/25 transition-all hover:bg-[var(--color-primary-deep)] disabled:opacity-60"
          >
            {loading ? "Checking…" : "Unlock"}
          </button>
        </form>
      </main>
    );
  }

  // Dashboard state
  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="relative size-11 overflow-hidden rounded-2xl shadow-md shadow-[var(--color-primary)]/15">
              <Image src="/Qubi.jpg" alt="Qubi mascot" width={44} height={44} className="object-cover" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-[var(--color-ink)]" style={{ fontFamily: "var(--font-display)" }}>
                Waitlist Dashboard
              </h1>
              <p className="text-xs text-[var(--color-muted)]">
                {entries === null ? "…" : `${entries.length} subscriber${entries.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-white/80 px-4 text-xs font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
            >
              ← Back to site
            </Link>
            <button
              onClick={() => fetchList(savedPasscode)}
              disabled={loading}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/80 text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
              aria-label="Refresh"
            >
              <RefreshCwIcon className="size-4" />
            </button>
          </div>
        </div>

        {loading && entries === null ? (
          <div className="glass-card p-10 text-center text-sm text-[var(--color-muted)]">Loading subscribers…</div>
        ) : entries === null || entries.length === 0 ? (
          <div className="glass-card flex flex-col items-center gap-3 p-12 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
              <UsersIcon className="size-6" />
            </span>
            <p className="font-semibold text-[var(--color-ink)]">No subscribers yet</p>
            <p className="text-sm text-[var(--color-muted)]">Share the landing page to start growing your waitlist.</p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <p className="text-sm font-semibold text-[var(--color-ink)]">{entries.length} email{entries.length === 1 ? "" : "s"}</p>
              <div className="flex items-center gap-2">
                <a
                  href={`mailto:?bcc=${entries.map((e) => e.email).join(",")}`}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-3.5 text-xs font-semibold text-white shadow-md shadow-[var(--color-primary)]/25 transition-colors hover:bg-[var(--color-primary-deep)]"
                >
                  <MailIcon className="size-3.5" />
                  Email all
                </a>
                <button
                  onClick={copyAll}
                  className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-white/80 px-3.5 text-xs font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
                >
                  {copied === "all" ? <CheckIcon className="size-3.5 text-[var(--color-success)]" /> : <CopyIcon className="size-3.5" />}
                  Copy all
                </button>
              </div>
            </div>
            <ul className="divide-y divide-[var(--color-border)]">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-5 py-3">
                  <a href={`mailto:${entry.email}`} className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-ink)] hover:text-[var(--color-primary)]">
                    {entry.email}
                  </a>
                  <span className="shrink-0 text-xs text-[var(--color-muted-soft)]">
                    {new Date(entry.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <button
                    onClick={() => copyEmail(entry.email)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/80 text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
                    aria-label={`Copy ${entry.email}`}
                  >
                    {copied === entry.email ? <CheckIcon className="size-3.5 text-[var(--color-success)]" /> : <CopyIcon className="size-3.5" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}