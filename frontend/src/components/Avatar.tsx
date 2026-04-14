"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  /** Use para cache-bust quando a foto muda (ex.: user.updatedAt) */
  avatarVersion?: string | number | Date | null;
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
  avatarVersion,
  size = 36,
  className,
  imgClassName,
  fallbackClassName,
}: Props) {
  const label = (name || email || "").trim();
  const initials = useMemo(() => getInitials(label), [label]);
  const src = useMemo(() => (avatarUrl ? resolveAvatarSrc(avatarUrl) : ""), [avatarUrl]);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  const baseStyle: React.CSSProperties = { width: size, height: size };

  const defaultSrc = "/uploads/users/default-avatar.svg";

  const versionParam = useMemo(() => {
    if (avatarVersion == null) return "";
    const v =
      avatarVersion instanceof Date
        ? avatarVersion.getTime()
        : typeof avatarVersion === "string"
          ? Date.parse(avatarVersion)
          : Number(avatarVersion);
    if (!Number.isFinite(v) || v <= 0) return "";
    return String(v);
  }, [avatarVersion]);

  const srcWithVersion = useMemo(() => {
    const base = src || defaultSrc;
    if (!versionParam) return base;
    return base.includes("?") ? `${base}&v=${encodeURIComponent(versionParam)}` : `${base}?v=${encodeURIComponent(versionParam)}`;
  }, [src, defaultSrc, versionParam]);

  if ((src || defaultSrc) && !imgError) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={srcWithVersion}
        alt={name || email || "Avatar"}
        style={baseStyle}
        onError={() => setImgError(true)}
        className={
          "block rounded-full object-cover bg-[color:var(--surface)] border border-[color:var(--border)] " +
          (imgClassName || "") +
          (className ? ` ${className}` : "")
        }
      />
    );
  }

  // Em caso de erro de imagem, cai para iniciais (último recurso)
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

