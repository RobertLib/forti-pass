"use strict";

/* Small HTML helpers shared by the templates. */

/** Escapes text for use inside an attribute or element. */
function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text of an HTML fragment, for meta tags and structured data. */
function text(html) {
  return String(html)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    // Last, so "&amp;lt;" becomes the text "&lt;" and is not decoded twice.
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function icon(id, extraClass) {
  return `<svg class="icon${extraClass ? " " + extraClass : ""}" aria-hidden="true"><use href="#${id}" /></svg>`;
}

const SPRITE_SYMBOLS = `
        <symbol id="i-shield" viewBox="0 0 24 24">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </symbol>
        <symbol id="i-copy" viewBox="0 0 24 24">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </symbol>
        <symbol id="i-check" viewBox="0 0 24 24">
          <polyline points="20 6 9 17 4 12" />
        </symbol>
        <symbol id="i-refresh" viewBox="0 0 24 24">
          <polyline points="21 4 21 10 15 10" />
          <polyline points="3 20 3 14 9 14" />
          <path d="M3.5 9a8.5 8.5 0 0 1 14-3.2L21 9" />
          <path d="M20.5 15a8.5 8.5 0 0 1-14 3.2L3 15" />
        </symbol>
        <symbol id="i-eye" viewBox="0 0 24 24">
          <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" />
          <circle cx="12" cy="12" r="3" />
        </symbol>
        <symbol id="i-eye-off" viewBox="0 0 24 24">
          <path
            d="M17.9 17.9A10 10 0 0 1 12 19.5C5.5 19.5 1.5 12 1.5 12a18.4 18.4 0 0 1 5-5.9M9.9 4.8A10 10 0 0 1 12 4.5c6.5 0 10.5 7.5 10.5 7.5a18.5 18.5 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2"
          />
          <line x1="2" y1="2" x2="22" y2="22" />
        </symbol>
        <symbol id="i-download" viewBox="0 0 24 24">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </symbol>
        <symbol id="i-trash" viewBox="0 0 24 24">
          <polyline points="3 6 5 6 21 6" />
          <path
            d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a2 2 0 0 1 2-2 2 2 0 0 1 2 2v2"
          />
        </symbol>
        <symbol id="i-sun" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4.2" />
          <path
            d="M12 1.5v2.2M12 20.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M1.5 12h2.2M20.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"
          />
        </symbol>
        <symbol id="i-moon" viewBox="0 0 24 24">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </symbol>
        <symbol id="i-close" viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </symbol>
        <symbol id="i-clock" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15.5 14" />
        </symbol>
        <symbol id="i-gauge" viewBox="0 0 24 24">
          <path d="M4 18a8 8 0 1 1 16 0" />
          <line x1="12" y1="18" x2="16" y2="10" />
        </symbol>
        <symbol id="i-search" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7.5" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </symbol>
        <symbol id="i-history" viewBox="0 0 24 24">
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <polyline points="3 4 3 9 8 9" />
          <polyline points="12 8 12 12 15 14" />
        </symbol>
        <symbol id="i-warning" viewBox="0 0 24 24">
          <path d="M12 3l9.5 17H2.5L12 3z" />
          <line x1="12" y1="9" x2="12" y2="14" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </symbol>
        <symbol id="i-wifi" viewBox="0 0 24 24">
          <path d="M2 8.8a15 15 0 0 1 20 0" />
          <path d="M5.5 12.4a10 10 0 0 1 13 0" />
          <path d="M9 16a5 5 0 0 1 6 0" />
          <line x1="12" y1="19.5" x2="12.01" y2="19.5" />
        </symbol>
        <symbol id="i-print" viewBox="0 0 24 24">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </symbol>
        <symbol id="i-key" viewBox="0 0 24 24">
          <circle cx="7.5" cy="15.5" r="4.5" />
          <path d="M10.7 12.3 20 3M16 7l3 3M18.5 4.5l2 2" />
        </symbol>
        <symbol id="i-globe" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M2.5 12h19M12 2.5a14.5 14.5 0 0 1 0 19M12 2.5a14.5 14.5 0 0 0 0 19" />
        </symbol>
        <symbol id="i-plus" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </symbol>
        <symbol id="i-minus" viewBox="0 0 24 24">
          <path d="M5 12h14" />
        </symbol>
        <symbol id="i-chevron" viewBox="0 0 24 24">
          <polyline points="6 9 12 15 18 9" />
        </symbol>
        <symbol id="i-lock" viewBox="0 0 24 24">
          <rect x="4" y="10.5" width="16" height="11" rx="2.5" />
          <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
        </symbol>
        <symbol id="i-offline" viewBox="0 0 24 24">
          <path d="M8.5 5.3A7 7 0 0 1 18.2 10h.3a4.5 4.5 0 0 1 2.9 7.9M17 19H7a5 5 0 0 1-2-9.6" />
          <line x1="3" y1="3" x2="21" y2="21" />
        </symbol>
        <symbol id="i-code" viewBox="0 0 24 24">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </symbol>
        <symbol id="i-book" viewBox="0 0 24 24">
          <path d="M4 19.5V5a2.5 2.5 0 0 1 2.5-2.5H20v17H6.5A2.5 2.5 0 0 0 4 22h16" />
        </symbol>`;

module.exports = { esc, text, icon, SPRITE_SYMBOLS };
