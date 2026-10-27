import { escapeHtml } from "../lib/html.ts";

export function renderEmptyState(title, hint) {
  return `<div class="empty-state"><p class="empty-state-title">${escapeHtml(title)}</p><p class="empty-state-hint">${escapeHtml(hint)}</p></div>`;
}

