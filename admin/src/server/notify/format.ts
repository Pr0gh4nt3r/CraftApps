// Notifications are written in a small Markdown subset: paragraphs, lists with "- " and
// **bold**. Gotify, ntfy and Discord show it as it is; e-mails and Telegram get it converted.

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BOLD = /\*\*(.+?)\*\*/g;

/** Escaped HTML with <tag> for bold */
const inline = (text: string, tag: string): string => escapeHtml(text).replace(BOLD, `<${tag}>$1</${tag}>`);

/** HTML for e-mails: paragraphs, lists, bold */
export function markdownToHtml(markdown: string): string {
  return markdown
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n');
      return lines.every((line) => line.startsWith('- '))
        ? `<ul>${lines.map((line) => `<li>${inline(line.slice(2), 'strong')}</li>`).join('')}</ul>`
        : `<p>${lines.map((line) => inline(line, 'strong')).join('<br>')}</p>`;
    })
    .join('\n');
}

/** Telegram's HTML knows no lists – bullets instead */
export const markdownToTelegram = (markdown: string): string =>
  markdown
    .split('\n')
    .map((line) => inline(line.startsWith('- ') ? `• ${line.slice(2)}` : line, 'b'))
    .join('\n');

/** Plain text, e.g. the text part of an e-mail */
export const markdownToText = (markdown: string): string => markdown.replace(BOLD, '$1');
