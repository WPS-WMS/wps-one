/**
 * Estilos do corpo de comentário (HTML do RichTextEditor / contenteditable).
 * Garante quebras de linha (\n) e blocos típicos (<div>, <p>, <br>) não fiquem “amontoados”.
 */
export const commentHtmlBodyClassName =
  "text-sm text-[color:var(--foreground)] prose prose-sm max-w-none break-words whitespace-pre-line " +
  "[&_ul]:whitespace-normal [&_ol]:whitespace-normal " +
  "[&_p:not(:last-child)]:mb-2 " +
  "[&_div]:block [&_div+div]:mt-1 " +
  "[&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2 " +
  "[&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4";
