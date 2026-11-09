# FortiPass — Strong Password & Passphrase Generator

🔐 **Free online password generator** that runs entirely in your browser. Random
passwords, memorable passphrases and PINs, with honest strength maths and no
network requests at all.

**Live demo:** [robertlib.github.io/forti-pass](https://robertlib.github.io/forti-pass/)

## Features

### Three ways to generate

- **Password** — 4 to 128 characters, any mix of uppercase, lowercase, numbers
  and symbols
- **Passphrase** — random words from a 2,200+ word list (~11 bits per word),
  with a choice of separators, capitalisation, a trailing number or symbol
- **PIN** — 3 to 16 digits

### Strength you can actually reason about

- Entropy shown in **bits**, calculated from the real character pool or word
  list size — not a hand-waved "strong" badge
- Estimated **crack time** for an offline attacker at 100 billion guesses per
  second
- Five-segment meter from Very weak to Excellent

### Built-in strength checker

Paste a password you already use and get a local verdict: entropy, crack time
and specific findings. The estimate splits the password into the cheapest
pieces an attacker would try — dictionary words (also when glued together, as
in `correcthorse`), common passwords and names, leet-speak variants such as
`P@ssw0rd`, years, repeated characters, keyboard and alphabet runs, and copies
of an earlier block (`Ab3$Ab3$Ab3$`) — so patterned passwords are not scored
as if every character were random.

### Usability

- Quick presets: Memorable, Web login, Maximum, Easy to read, 6-digit PIN
- Generate up to 50 at once, with copy-all, download and per-row regeneration
- Colour-coded characters so digits and symbols are easy to read off the screen
- Click-to-copy anywhere, plus a hide/show toggle for shoulder surfers
- Optional clipboard clearing 30 seconds after a copy
- Session list of what you generated and copied — memory only, gone on reload
- Advanced options: avoid look-alike characters, forbid repeats, require every
  selected type, exclude specific characters
- Light and dark themes, remembered settings, keyboard shortcuts
- Installable PWA that works fully offline

### Keyboard shortcuts

| Key         | Action                      |
| ----------- | --------------------------- |
| `G`         | Generate new                |
| `C`         | Copy the current password   |
| `H`         | Hide / show passwords       |
| `T`         | Switch light / dark theme   |
| `1` `2` `3` | Password / passphrase / PIN |
| `?`         | Keyboard shortcuts dialog   |

`1` `2` `3` are matched by physical key, so they also work on layouts where the
digit row needs Shift (Czech, French…). In the mode tabs, the arrow keys, Home
and End switch modes.

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
- **Nothing leaves the device.** No accounts, no analytics, no requests — and a
  Content Security Policy with `connect-src 'none'` makes the browser enforce
  that. Only your generator preferences are stored (in `localStorage`);
  generated passwords never are.
- **No password is ever injected as markup** — values are set via `textContent`,
  so there is nothing to escape.

## Usage

1. Pick a mode: password, passphrase or PIN
2. Adjust length, character types or word count
3. Press **Generate** (or `G`) and click the result to copy it

## Development

There is no build step. Clone the repository and open `index.html`, or serve the
folder to exercise the service worker:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Tests use Node's built-in runner (Node 18+, no dependencies):

```bash
npm test
```

| File                | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `index.html`        | Markup, SEO metadata, structured data, CSP                |
| `styles.css`        | Design tokens, light/dark themes, layout                  |
| `core.js`           | Randomness, generators, entropy maths, strength checker   |
| `script.js`         | User interface wiring                                     |
| `wordlist.js`       | Passphrase word list                                      |
| `sw.js`             | Offline caching                                           |
| `tests/`            | Unit tests for `core.js`, consistency checks for the site |
| `icon.svg`          | Icon source for the generated PNGs                        |
| `icon-maskable.svg` | Full-bleed icon source for Android adaptive icons         |
| `og-image.svg`      | Social preview source                                     |

### Shipping a change

1. Bump `ASSET_VERSION` in `sw.js` **and** the `?v=` query on the stylesheet
   and scripts in `index.html`. The versioned URLs stop a returning visitor from
   getting new HTML with stale JavaScript from the old cache.
2. If you edit the inline theme script in `index.html`, update its
   `sha256-…` hash in the Content Security Policy.
3. Update `<lastmod>` in `sitemap.xml`.
4. Run `npm test` — it fails if steps 1 or 2 were missed and prints the
   correct hash.

Images are rendered from the SVG sources:

```bash
rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png
rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png
rsvg-convert -w 180 -h 180 icon.svg -o apple-touch-icon.png
rsvg-convert -w 512 -h 512 icon-maskable.svg -o icon-maskable-512.png
rsvg-convert -w 1200 -h 630 og-image.svg -o og-image.png
```

## Notes on the strength checker

The checker is a heuristic, not a full cracking simulation. It knows a list of
very common passwords, the built-in word list, leet substitutions, repeats,
keyboard runs and years. It cannot know your pet's name, your city or words
in other languages — treat a good score as "no obvious weakness found", not a
guarantee.

For generated output the checker and the generator agree closely, with one
deliberate difference: the checker does not know which separator a
passphrase uses, so it credits a few bits more than the generator, which
assumes the attacker knows your exact settings.

## Contributing

Issues and pull requests are welcome.

## License

MIT License — feel free to use and modify.

---

**Tags:** #password #passphrase #security #generator #cybersecurity #pwa #javascript #webtools
