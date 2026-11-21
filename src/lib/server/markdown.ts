import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
	'h2',
	'h3',
	'h4',
	'p',
	'a',
	'ul',
	'ol',
	'li',
	'strong',
	'em',
	'code',
	'pre',
	'blockquote',
	'hr',
	'br',
	'table',
	'thead',
	'tbody',
	'tr',
	'th',
	'td'
];

/**
 * Renders community Markdown to sanitised HTML. The page title is the only h1,
 * so headings in the body start at h2.
 */
export function renderMarkdown(source: string): string {
	const html = marked.parse(source, { async: false, gfm: true });
	return sanitizeHtml(html, {
		allowedTags: ALLOWED_TAGS,
		allowedAttributes: { a: ['href', 'title'], th: ['scope'] },
		allowedSchemes: ['http', 'https', 'mailto'],
		transformTags: { h1: 'h2' }
	});
}
