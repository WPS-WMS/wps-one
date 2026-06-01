/**
 * Estilos do corpo de comentário (HTML do RichTextEditor / contenteditable).
 * Garante quebras de linha (\n) e blocos típicos (<div>, <p>, <br>) não fiquem “amontoados”.
 */
export const commentHtmlBodyClassName =
  "text-sm text-[color:var(--foreground)] prose prose-sm max-w-none break-words " +
  "[&_p]:whitespace-pre-wrap [&_p:not(:last-child)]:mb-2 " +
  "[&_div]:block [&_div+div]:mt-1 " +
  "[&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2 " +
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ul]:whitespace-normal " +
  "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_ol]:whitespace-normal " +
  "[&_li]:my-0.5 [&_li]:display-list-item " +
  "[&_.wps-mention]:font-semibold [&_.wps-mention]:text-[color:var(--primary)]";
