"use client";

import { useMemo } from "react";
import { commentHtmlBodyClassName } from "@/lib/commentHtmlDisplay";
import { getPlainTextFromHtml, prepareRichHtmlForDisplay } from "@/lib/linkifyContent";
import { sanitizeClientHtml } from "@/lib/sanitizeClientHtml";

type RichHtmlBodyProps = {
  html: string;
  className?: string;
  title?: string;
};

export function RichHtmlBody({ html, className = "", title }: RichHtmlBodyProps) {
  const safeHtml = useMemo(
    () => sanitizeClientHtml(prepareRichHtmlForDisplay(html)),
    [html],
  );
  const plainTitle = title ?? getPlainTextFromHtml(html);

  return (
    <div
      className={`${commentHtmlBodyClassName} ${className}`.trim()}
      title={plainTitle || undefined}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
