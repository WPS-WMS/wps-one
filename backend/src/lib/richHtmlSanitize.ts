import sanitizeHtml from "sanitize-html";

/** Allowlist compartilhada para descrição de tarefa e comentários (RichTextEditor). */
export function sanitizeRichHtml(html: string): string {
  return sanitizeHtml(String(html || ""), {
    allowedTags: [
      "b",
      "strong",
      "i",
      "em",
      "u",
      "s",
      "p",
      "br",
      "div",
      "span",
      "ul",
      "ol",
      "li",
      "blockquote",
      "code",
      "pre",
      "a",
      "img",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "title"],
      span: ["class", "data-mention-id", "data-mention-name", "style"],
      "*": ["style"],
    },
    allowedClasses: {
      span: ["wps-mention"],
    },
    allowedSchemes: ["http", "https", "data", "blob"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    allowedStyles: {
      "*": {
        color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i],
        "text-align": [/^left$/, /^right$/, /^center$/, /^justify$/],
        "font-weight": [/^\d+$/, /^bold$/, /^normal$/],
        "font-style": [/^italic$/, /^normal$/],
        "text-decoration": [/^none$/, /^underline$/, /^line-through$/],
        "font-size": [/^\d+(?:\.\d+)?px$/],
        "line-height": [/^\d+(?:\.\d+)?$/],
      },
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }, true),
    },
  });
}
