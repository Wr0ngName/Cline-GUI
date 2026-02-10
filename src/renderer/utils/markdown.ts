/**
 * Simple markdown rendering utility for chat messages
 *
 * Converts a subset of markdown syntax to HTML for display in the chat interface.
 * Uses DOMPurify for sanitization to prevent XSS attacks.
 */

import DOMPurify, { type Config } from 'dompurify';

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Configuration for DOMPurify sanitization
 */
const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: ['pre', 'code', 'br', 'span', 'strong', 'em', 'h1', 'h2', 'h3', 'ul', 'li', 'a'],
  ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
  RETURN_TRUSTED_TYPE: false,
};

/**
 * CSS classes for rendered markdown elements
 */
const CLASSES = {
  CODE_BLOCK: 'code-block',
  INLINE_CODE: 'px-1 py-0.5 bg-surface-100 dark:bg-surface-700 rounded text-sm font-mono',
  H1: 'text-xl font-bold mt-4 mb-2',
  H2: 'text-lg font-semibold mt-4 mb-2',
  H3: 'text-base font-semibold mt-3 mb-1',
  LIST_ITEM: 'ml-4',
  LIST: 'list-disc list-inside my-2',
  LINK: 'text-primary-500 hover:underline',
} as const;

/**
 * Render markdown content to sanitized HTML
 *
 * Supports:
 * - Code blocks (```language\n...\n```)
 * - Inline code (`code`)
 * - Headers (# ## ###)
 * - Bold (**text** or __text__)
 * - Italic (*text* or _text_)
 * - Bullet lists (- item)
 * - Links ([text](url))
 *
 * @param content - The markdown content to render
 * @returns Sanitized HTML string
 */
export function renderMarkdown(content: string): string {
  let html = content;

  // Replace code blocks first (before other processing)
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, lang, code) => {
    const language = lang || 'text';
    return `<pre class="${CLASSES.CODE_BLOCK}"><code class="language-${language}">${escapeHtml(code.trim())}</code></pre>`;
  });

  // Replace inline code (escape HTML to prevent XSS)
  html = html.replace(/`([^`]+)`/g, (_match, code) => {
    return `<code class="${CLASSES.INLINE_CODE}">${escapeHtml(code)}</code>`;
  });

  // Replace headers (## Header)
  html = html.replace(/^### (.+)$/gm, `<h3 class="${CLASSES.H3}">$1</h3>`);
  html = html.replace(/^## (.+)$/gm, `<h2 class="${CLASSES.H2}">$1</h2>`);
  html = html.replace(/^# (.+)$/gm, `<h1 class="${CLASSES.H1}">$1</h1>`);

  // Replace bold (**text** or __text__)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Replace italic (*text* or _text_) - but not inside URLs or already processed
  html = html.replace(/(?<![*_])\*([^*]+)\*(?![*_])/g, '<em>$1</em>');
  html = html.replace(/(?<![*_])_([^_]+)_(?![*_])/g, '<em>$1</em>');

  // Replace bullet lists (- item)
  html = html.replace(/^- (.+)$/gm, `<li class="${CLASSES.LIST_ITEM}">$1</li>`);

  // Wrap consecutive li elements in ul
  html = html.replace(/(<li[^>]*>.*?<\/li>\s*)+/gs, (match) => {
    return `<ul class="${CLASSES.LIST}">${match}</ul>`;
  });

  // Replace links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    `<a href="$2" class="${CLASSES.LINK}" target="_blank" rel="noopener">$1</a>`);

  // Replace newlines with br tags (but not inside pre/ul blocks)
  html = html.replace(/\n/g, '<br>');

  // Clean up br tags that shouldn't be there
  html = html.replace(/<br>\s*<(h[1-6]|ul|li|pre)/g, '<$1');
  html = html.replace(/<\/(h[1-6]|ul|li|pre)>\s*<br>/g, '</$1>');

  // Sanitize HTML to prevent XSS attacks
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
