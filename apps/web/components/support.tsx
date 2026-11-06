"use client";
import { useEffect, useRef, useState } from "react";
import { Coffee, ArrowUpRight, X } from "lucide-react";
import { SUPPORT_URL } from "../lib/links";
const STORAGE_KEY = "readmory-support-remind-after";
const REMINDER_DELAY = 5 * 60 * 1000;
const COOLDOWN = 30 * 24 * 60 * 60 * 1000;
function snooze() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now() + COOLDOWN));
  } catch {
    /* Optional reminder preferences must not affect the library. */
  }
}
function coolingDown() {
  try {
    const until = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}
export function SupportLink({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <a
      className={`support-link ${className}`}
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Support Readmory on Ko-fi"
      onClick={() => {
        snooze();
        window.dispatchEvent(new Event("readmory-support-opened"));
      }}
    >
      <Coffee size={18} aria-hidden="true" />
      <span>{compact ? "Support" : "Support Readmory"}</span>
      <ArrowUpRight size={15} aria-hidden="true" />
    </a>
  );
}
/** A local, once-per-month reminder; never loads Ko-fi until its link is opened. */
export default function SupportReminder({ eligible }: { eligible: boolean }) {
  const [visible, setVisible] = useState(false);
  const elapsed = useRef(0),
    shown = useRef(false);
  useEffect(() => {
    const hide = () => {
      shown.current = true;
      setVisible(false);
    };
    window.addEventListener("readmory-support-opened", hide);
    return () => window.removeEventListener("readmory-support-opened", hide);
  }, []);
  useEffect(() => {
    if (!eligible || shown.current || coolingDown()) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now(),
        delta = Math.min(1000, Math.max(0, now - last));
      last = now;
      if (
        document.visibilityState !== "visible" ||
        document.querySelector("dialog[open]") ||
        coolingDown()
      )
        return;
      elapsed.current += delta;
      if (elapsed.current < REMINDER_DELAY) return;
      shown.current = true;
      snooze();
      setVisible(true);
      window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [eligible]);
  if (!visible || !eligible) return null;
  return (
    <aside className="support-reminder" aria-label="Support Readmory reminder">
      <div>
        <Coffee size={21} aria-hidden="true" />
        <p>Enjoying Readmory? Help keep it growing.</p>
      </div>
      <a
        className="support-reminder-link"
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          snooze();
          setVisible(false);
        }}
      >
        Support on Ko-fi <ArrowUpRight size={15} aria-hidden="true" />
      </a>
      <button
        className="icon-button"
        aria-label="Dismiss support reminder"
        onClick={() => {
          snooze();
          setVisible(false);
        }}
      >
        <X size={18} />
      </button>
    </aside>
  );
}
