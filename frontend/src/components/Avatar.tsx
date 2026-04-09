"use client";

import { useMemo } from "react";

type Props = {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  size?: number; // px
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
};

function getInitials(nameOrEmail: string) {
  const base = (nameOrEmail || "").trim();
  if (!base) return "?";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function resolveAvatarSrc(avatarUrl: string) {
  const raw = avatarUrl.trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const base =
    process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.length > 0
      ? process.env.NEXT_PUBLIC_API_URL
      : "https://wps-one-backend-production.onrender.com";
  return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

export function Avatar({
  name,
  email,
  avatarUrl,
  size = 36,
  className,
  imgClassName,
  fallbackClassName,
}: Props) {
  const label = (name || email || "").trim();
  const initials = useMemo(() => getInitials(label), [label]);
  const src = useMemo(() => (avatarUrl ? resolveAvatarSrc(avatarUrl) : ""), [avatarUrl]);

  const baseStyle: React.CSSProperties = { width: size, height: size };

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name || email || "Avatar"}
        style={baseStyle}
        className={
          "rounded-full object-cover border border-[color:var(--border)] " + (imgClassName || "") + (className ? ` ${className}` : "")
        }
      />
    );
  }

  return (
    <div
      style={baseStyle}
      className={
        "rounded-full grid place-items-center font-semibold bg-[color:var(--primary)] text-[color:var(--primary-foreground)] " +
        (fallbackClassName || "text-sm") +
        (className ? ` ${className}` : "")
      }
      aria-label={name || email || "Avatar"}
      title={name || email || undefined}
    >
      {initials}
    </div>
  );
}

