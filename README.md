# FortiPass — Strong Password & Passphrase Generator

🔐 **Free online password generator** that runs entirely in your browser. Random
passwords, memorable passphrases (English or Czech), PINs and Wi-Fi QR codes,
with honest strength maths and no network requests at all.

**Live:** [robertlib.github.io/forti-pass](https://robertlib.github.io/forti-pass/)
· **Česky:** [robertlib.github.io/forti-pass/cs/](https://robertlib.github.io/forti-pass/cs/)

## Tools

Every tool has its own page in English and Czech, linked with `hreflang`:

| Tool                        | English                          | Czech                                |
| --------------------------- | -------------------------------- | ------------------------------------ |
| Password generator          | `/`                              | `/cs/`                               |
| Passphrase generator        | `/passphrase-generator/`         | `/cs/generator-hesel-ze-slov/`       |
| PIN generator               | `/pin-generator/`                | `/cs/generator-pin/`                 |
| Password strength checker   | `/password-strength-checker/`    | `/cs/kontrola-sily-hesla/`           |
| Wi-Fi password & QR code    | `/wifi-password-generator/`      | `/cs/generator-hesla-wifi/`          |
| Crack-time table            | `/how-long-to-crack-a-password/` | `/cs/jak-dlouho-trva-prolomit-heslo/` |

Also available as a [command-line tool](#command-line) and a
[browser extension](#browser-extension).

### How the app is laid out

- **Three sections** — Generator, Check and Wi-Fi — in the top bar on a
  computer and in a tab bar at the bottom on a phone.
- **One card per tool.** The result sits on the left with its strength and
  actions, the settings on the right, so every change is visible at once; on
  narrow screens the two stack.
- **Password, Passphrase and PIN are pages, not hidden tabs.** The switch at
  the top of the generator links between them, so the address always matches
  what is on screen and each mode can be bookmarked or shared. Settings are
  remembered per mode; "Hide" carries over while you switch.
- Supporting text, tables and FAQs follow below the tool, never above it.

## Features

### Generators

- **Password** — 4 to 128 characters, any mix of uppercase, lowercase, numbers
  and symbols
- **Passphrase** — random words from the 7,776-word EFF list or a 7,776-word
  Czech list (12.9 bits per word), Czech optionally without accents; a choice of
  separators, capitalisation, a trailing number or symbol
- **PIN** — 3 to 16 digits, shown with its number of combinations rather
  than an offline crack time (PINs rely on lockouts, not length)
- **Wi-Fi** — WPA2/WPA3 passwords in four styles (easy to type on a TV, words,
  32 characters, 63 characters) and a QR code phones can scan to join; print a
  guest card or save the code as SVG. The network name is checked against the
  32-byte SSID limit (an accented letter takes two). The QR encoder (`qr.js`)
  is written from scratch with no dependencies, so the page still makes no
  network requests.

### Strength you can actually reason about

- Entropy shown in **bits**, calculated from the real character pool or word
  list size — not a hand-waved "strong" badge
- Estimated **crack time** for an offline attacker at 100 billion guesses per
  second
- Five-segment meter from Very weak to Excellent

### Built-in strength checker

Paste a password you already use and get a local verdict: entropy, crack time
and specific findings. The estimate splits the password into the cheapest
pieces an attacker would try — dictionary words in English and Czech (also
glued together, as in `correcthorse`, and with accents folded, so `kocicka` is
`kočička`), common passwords and Czech names, leet-speak variants such as
`P@ssw0rd`, years, repeated characters, keyboard walks (rows and columns on
QWERTY and QWERTZ, the Shift layer as in `!@#$%`, column walks such as
`1qaz2wsx`, and the Czech `+ěščřžý` row) and copies of an earlier block
(`Ab3$Ab3$Ab3$`) — so patterned passwords are not scored as if every character
were random. A well-known password with cheap dressing — leet swaps, a year or
`!!` at either end, separators as in `correct horse battery staple` — is capped
as very weak; random characters around a common word (`4829!2Martin%93&1`)
keep the strength they genuinely add.

### Usability

- Quick settings: Web login (16), Maximum (32), Easy to read and, in Czech,
  **Datová schránka** (24 characters that meet the ISDS rules); 4, 6 or 8
  digits for PINs. A chip stays lit only while the options still match it.
- Generate a list of up to 50 at once, with copy-all, download and per-row
  regeneration
- Colour-coded characters so digits and symbols are easy to read off the screen
- Click-to-copy anywhere, plus a hide/show toggle for shoulder surfers
- Optional clipboard clearing 30 seconds after a copy. The deadline survives
  moving between FortiPass pages; Firefox and Safari only allow the wipe during
  a click or key press, so there it happens at your next one on the page
- Session list of what you generated and copied — memory only, gone on reload
- Advanced options: avoid look-alike characters, forbid repeats, require every
  selected type, exclude specific characters
- Light and dark themes (toggling back to your system's theme follows the
  system again), remembered settings, keyboard shortcuts
- Installable PWA that works fully offline, in English and Czech

### Keyboard shortcuts

| Key         | Action                      |
| ----------- | --------------------------- |
| `G`         | Generate new                |
| `C`         | Copy the current password   |
| `H`         | Hide / show passwords       |
| `T`         | Switch light / dark theme   |
| `1` `2` `3` | Password / passphrase / PIN page |
| `?`         | Keyboard shortcuts dialog   |

`1` `2` `3` are matched by physical key, so they also work on layouts where the
digit row needs Shift (Czech, French…). The shortcut list is linked from the
footer of every page.

## Security

- **Cryptographic randomness only.** Every character and word is chosen with
  `crypto.getRandomValues()` using rejection sampling, so there is no modulo
  bias. `Math.random()` is never used as a fallback — if the Web Crypto API is
  missing, FortiPass refuses to generate.
- **Unbiased shuffling.** Fisher-Yates driven by the same CSPRNG, instead of the
  common `sort(() => Math.random() - 0.5)` mistake.
- **Exact entropy.** "Use every selected type" is enforced by rejection
  sampling, so every valid password is equally likely and the bits shown are
  computed exactly (inclusion–exclusion), not approximated.
- **Honest word lists.** Both lists are de-duplicated after folding accents, so
  "without accents" never merges two words and every word is worth exactly
  log₂(list size) bits.
- **Nothing leaves the device.** No accounts, no analytics, no requests — and a
  Content Security Policy with `connect-src 'none'` makes the browser enforce
  that, on every page and in the extension. Only your generator preferences
  are stored (in `localStorage`); generated passwords, Wi-Fi names and Wi-Fi
  passwords never are.
- **No password is ever injected as markup** — values are set via `textContent`,
  so there is nothing to escape.

## Command line

The same `core.js` and word lists, on Node 18+:

```bash
node cli/fortipass.js                          # one 16-character password
node cli/fortipass.js -l 32 -n 5               # five 32-character passwords
node cli/fortipass.js -w 6 --lang cs           # a Czech passphrase, no accents
node cli/fortipass.js -w 5 -s digit --symbol   # random digits between words, a symbol at the end
node cli/fortipass.js --pin 6 --json           # machine-readable, with a numeric score
node cli/fortipass.js --check                  # rate a password typed without echo
node cli/fortipass.js --help                   # every option and its limits
```

Values go to stdout and the strength summary to stderr, so
`node cli/fortipass.js | pbcopy` copies only the password. Limits match the
website (length 4–128, 3–12 words, PIN 3–16 digits); `-n` goes up to 1000.
`--check` reads the first line of stdin, or prompts without echo on a terminal,
and exits 1 for anything below Strong; add `-q` to print nothing and use only
the exit status in scripts. Usage errors exit 2.

`package.json` already declares the `fortipass` binary and the files to ship.
It is marked `"private": true` so nothing is published by accident; remove that
line and run `npm publish` to make `npx fortipass` work.

## Browser extension

`extension/` is a Manifest V3 popup for Chrome, Edge and Firefox (140+) with
the same generators and limits as the website, in English and Czech. It
requests **no permissions**, declares to Firefox that it collects no data, and
its CSP forbids network access. Its version is the project's (`package.json`),
and `npm test` fails if the two drift apart.

```bash
npm run build:extension
```

This copies the shared `core.js`, word lists and Czech strings into
`dist/fortipass-extension/` (load it as an unpacked extension to try it) and
zips it as `dist/fortipass-extension-<version>.zip` for the Chrome Web Store,
Firefox Add-ons and Edge Add-ons. The zip is written by the build script itself
(no `zip` program needed, so it works on Windows) and is reproducible.

## Development

The pages are generated: templates and content live in `build/`, the word
lists in `wordlists/`. Generated files are committed, so GitHub Pages serves
the repository as it is (`.nojekyll` turns off Jekyll, which would otherwise
skip `_`-prefixed folders and render Markdown files as pages). The build also
typesets the Czech text — a one-letter preposition never ends a line — and
loads the word lists only on the pages that use them.

```bash
npm run build      # regenerate pages, word-list scripts, manifests, sitemap, sw.js
npm test           # Node's built-in runner, no dependencies
python3 -m http.server 8000   # then open http://localhost:8000
```

`npm test` fails if a generated file is out of date, if a link or `hreflang`
pair is broken, if a page lacks an element `script.js` needs, or if a script is
not pre-cached by the service worker.

The browser tests (`tests/app.test.js` for the site, `tests/popup.test.js` for
the extension) drive headless Chromium over the DevTools protocol, with no npm
dependencies, and skip when no browser is found. They use `FORTIPASS_CHROME`
if set, else Playwright's Chromium, else an installed Chrome. Branded Chrome
137+ cannot load an unpacked extension, so the popup tests need Chromium or
Chrome for Testing.

| Path                       | Purpose                                                         |
| -------------------------- | --------------------------------------------------------------- |
| `build/site.js`            | Site URL, asset version, page list — **edit to change domain**  |
| `build/content/en.js`, `cs.js` | Page copy, FAQ; figures are computed by `core.js`           |
| `build/strings.js`         | Interface text baked into the HTML                              |
| `build/layout.js`          | `<head>` (SEO, hreflang, JSON-LD, CSP), navigation, footer      |
| `build/components.js`      | Generator (per mode), checker, Wi-Fi card, crack-time tables    |
| `build/sw.template.js`     | Service worker source                                           |
| `wordlists/*.txt`          | Word lists, one word per line                                   |
| `core.js`                  | Randomness, generators, entropy maths, strength checker, Wi-Fi  |
| `qr.js`                    | Dependency-free QR code encoder                                 |
| `locale-cs.js`             | Czech strings for `core.js` and `script.js`                     |
| `script.js`                | User interface wiring                                           |
| `styles.css`               | Design tokens, light/dark themes, layout, tab bar, print card   |
| `cli/`, `extension/`       | Command-line tool and browser extension                         |
| `tests/`                   | Unit tests and site consistency checks                          |
| `*.svg`                    | Sources for the icons and social previews                       |

Generated (do not edit by hand): every `index.html`, `404.html`,
`wordlist-en.js`, `wordlist-cs.js`, `manifest.json`, `cs/manifest.json`,
`sitemap.xml`, `robots.txt`, `sw.js`.

### Shipping a change

1. Bump `UPDATED` in `build/site.js` if the content changed (sitemap `lastmod`,
   the "Updated" date and the year in the crack-time table's title).
2. `npm run build && npm test`.

There is no asset version to bump: the build hashes every script, the
stylesheet, the icons and the manifests, and uses the hash as the `?v=` query
and the service-worker cache name. Change any of them and returning visitors
get a fresh cache on their next visit; `npm test` fails if a page or `sw.js`
was not rebuilt after an asset changed.

### Moving to your own domain

Set `SITE_URL` in `build/site.js`, run `npm run build`, add a `CNAME` file and
set the custom domain in the repository's GitHub Pages settings. GitHub then
redirects the old `github.io` URLs to the new domain.

Crawlers only read `robots.txt` at the root of a host, so while the site lives
under `/forti-pass/` the generated `robots.txt` (and its `Sitemap:` line) is
ignored — submit `sitemap.xml` in Google Search Console instead. On a custom
domain it starts working as it is.

Images are rendered from the SVG sources:

```bash
rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png
rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png
rsvg-convert -w 180 -h 180 icon.svg -o apple-touch-icon.png
rsvg-convert -w 512 -h 512 icon-maskable.svg -o icon-maskable-512.png
rsvg-convert -w 1200 -h 630 og-image.svg -o og-image.png
rsvg-convert -w 1200 -h 630 og-image-cs.svg -o og-image-cs.png
for s in 16 32 48 128; do rsvg-convert -w $s -h $s icon.svg -o extension/icons/icon-$s.png; done
```

## Word lists

- **English:** the [EFF Large Wordlist](https://www.eff.org/dice) by the
  Electronic Frontier Foundation, licensed
  [CC BY 3.0 US](https://creativecommons.org/licenses/by/3.0/us/). Changed for
  FortiPass: the hyphen removed from four entries (drop-down, felt-tip, t-shirt,
  yo-yo) so a hyphen separator stays unambiguous, and the resulting duplicate
  "yoyo" replaced by "horse". `wordlists/en-extra.txt` adds common English words
  the strength checker recognises; the generator never uses them.
- **Czech:** compiled for FortiPass — everyday nouns, adjectives, verbs and
  adverbs of 3–8 letters, checked with a Czech spell checker, with offensive
  and distressing words left out, and unique even with accents removed.

## Notes on the strength checker

The checker is a heuristic, not a full cracking simulation. It knows lists of
very common passwords and Czech names, the English and Czech word lists, leet
substitutions, repeats, keyboard runs and years. It cannot know your pet's
name, your city, or whether a password has already leaked — treat a good score
as "no obvious weakness found", not a guarantee.

For generated output the checker and the generator agree closely, with one
deliberate difference: the checker does not know which separator a
passphrase uses, so it credits a few bits more than the generator, which
assumes the attacker knows your exact settings.

## Contributing

Issues and pull requests are welcome.

## License

MIT License — feel free to use and modify. The English word list is CC BY 3.0
US (see above).
