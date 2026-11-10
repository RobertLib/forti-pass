"use strict";

/* Site-wide settings for the static build. Moving to your own domain is a
   one-line change here: set SITE_URL, run `npm run build`, and every
   canonical, hreflang, Open Graph and sitemap URL follows. */

// Must end with a slash.
const SITE_URL = "https://robertlib.github.io/forti-pass/";

// Bump on every release: it busts the service-worker cache and the ?v= query
// on every script and stylesheet, so a returning visitor never mixes new HTML
// with old JavaScript.
const ASSET_VERSION = "5";

// Shown as "last updated" and written to the sitemap. Bump it when content
// changes; it is fixed (not today's date) so the build is reproducible.
const UPDATED = "2026-11-09";

const LANGUAGES = ["en", "cs"];

/**
 * Every page exists in both languages. `type` picks the tool on the page and
 * `section` the item lit in the main navigation. The three generator pages
 * are one tool: `mode` says what each generates, and the mode switch links
 * between them, so the address always matches what is on screen.
 */
const PAGES = [
  { id: "home", type: "generator", section: "generator", mode: "password", paths: { en: "", cs: "cs/" } },
  {
    id: "passphrase",
    type: "generator",
    section: "generator",
    mode: "passphrase",
    paths: { en: "passphrase-generator/", cs: "cs/generator-hesel-ze-slov/" },
  },
  {
    id: "pin",
    type: "generator",
    section: "generator",
    mode: "pin",
    paths: { en: "pin-generator/", cs: "cs/generator-pin/" },
  },
  {
    id: "checker",
    type: "checker",
    section: "checker",
    paths: { en: "password-strength-checker/", cs: "cs/kontrola-sily-hesla/" },
  },
  {
    id: "wifi",
    type: "wifi",
    section: "wifi",
    paths: { en: "wifi-password-generator/", cs: "cs/generator-hesla-wifi/" },
  },
  {
    id: "crack",
    type: "article",
    paths: { en: "how-long-to-crack-a-password/", cs: "cs/jak-dlouho-trva-prolomit-heslo/" },
  },
];

const AUTHOR = "Robert Libšanský";
const REPO_URL = "https://github.com/robertlib/forti-pass";

module.exports = { SITE_URL, ASSET_VERSION, UPDATED, LANGUAGES, PAGES, AUTHOR, REPO_URL };
