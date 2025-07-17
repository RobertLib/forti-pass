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
and specific findings — common-password matches (including leet-speak variants
such as `P@ssw0rd`), dictionary words, repeats, keyboard runs and dates.

### Usability

- Quick presets: Memorable, Web login, Maximum, Easy to read, 6-digit PIN
- Generate up to 50 at once, with copy-all, download and per-row regeneration
- Colour-coded characters so digits and symbols are easy to read off the screen
- Click-to-copy anywhere, plus a hide/show toggle for shoulder surfers
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

## Security

- **Cryptographic randomness only.** Every character and word is chosen with
  `crypto.getRandomValues()` using rejection sampling, so there is no modulo
  bias. `Math.random()` is never used as a fallback — if the Web Crypto API is
  missing, FortiPass refuses to generate.
- **Unbiased shuffling.** Fisher-Yates driven by the same CSPRNG, instead of the
  common `sort(() => Math.random() - 0.5)` mistake.
- **Nothing leaves the device.** No accounts, no analytics, no requests. Only
  your generator preferences are stored (in `localStorage`); generated passwords
  never are.
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

| File          | Purpose                                              |
| ------------- | ---------------------------------------------------- |
| `index.html`  | Markup, SEO metadata, structured data                |
| `styles.css`  | Design tokens, light/dark themes, layout             |
| `script.js`   | Generation, entropy maths, strength checker, UI      |
| `wordlist.js` | Passphrase word list                                 |
| `sw.js`       | Offline caching (bump `CACHE_VERSION` when shipping) |
| `icon.svg`    | Icon source for the generated PNGs                   |

Icons are rendered from `icon.svg`:

```bash
rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png
rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png
rsvg-convert -w 180 -h 180 icon.svg -o apple-touch-icon.png
```

## Notes on the strength checker

The checker is a heuristic, not a full cracking simulation. It knows a list of
very common passwords, the built-in word list, leet substitutions, repeats,
keyboard runs and date patterns. It cannot know your pet's name — treat a good
score as "no obvious weakness found", not a guarantee.

## Contributing

Issues and pull requests are welcome.

## License

MIT License — feel free to use and modify.

---

**Tags:** #password #passphrase #security #generator #cybersecurity #pwa #javascript #webtools
