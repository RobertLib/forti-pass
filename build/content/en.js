"use strict";

/* English page content. Every figure (bits, crack times, list sizes) comes
   from `f`, which computes it with core.js — so the prose can never drift
   from what the app actually does. `href(id)` links to another page. */

module.exports = function content(f, href, c) {
  const words = f.formatInt(f.wordCounts.en);
  const bpw = f.format1(f.bitsPerWord.en);


  const privacyAnswer =
    "No. Everything is generated in your browser tab with the Web Crypto API, and the page's Content Security Policy blocks every network request — open your browser's network panel and watch it stay empty. Only your settings are remembered on your device; generated values never are.";

  return {
    home: {
      title: "Password Generator – Strong, Offline & Open Source | FortiPass",
      ogTitle: "FortiPass – Free Strong Password & Passphrase Generator",
      description:
        "Free password generator that runs entirely in your browser. Strong random passwords, memorable passphrases and PINs, real entropy and crack-time estimates. No sign-up, no tracking, works offline.",
      h1: "Strong password generator",
      lede: "Random passwords from your browser's cryptographic randomness, with honest strength numbers. Nothing you generate leaves this device.",
      body: `<section class="content" aria-labelledby="whyHeading">
          <h2 id="whyHeading">Why FortiPass</h2>
          <div class="feature-grid">
            <article class="feature">
              <h3>Real cryptographic randomness</h3>
              <p>Every character comes from <code>crypto.getRandomValues()</code> with rejection sampling, so there is no modulo bias and no predictable seed — unlike generators built on <code>Math.random()</code>.</p>
            </article>
            <article class="feature">
              <h3>Honest strength numbers</h3>
              <p>Instead of a vague "strong" badge you get the actual entropy in bits and an estimated cracking time for an offline attacker making 100 billion guesses per second.</p>
            </article>
            <article class="feature">
              <h3>Nothing leaves your device</h3>
              <p>No accounts, no analytics, no network requests. Your settings are saved locally so the generator is ready the way you like it next time; the passwords themselves are never stored.</p>
            </article>
            <article class="feature">
              <h3>Install it and go offline</h3>
              <p>FortiPass is a progressive web app. Add it to your home screen or desktop and it keeps working on a plane, in a server room or with the network unplugged.</p>
            </article>
          </div>

          <h2>Choosing a good password</h2>
          <ul class="tips">
            <li><strong>Length beats complexity.</strong> A random 16-character password needs about ${f.pw(16, 90)} to brute-force; an 8-character one, about ${f.pw(8, 90)}. See the <a href="${href("crack")}">full crack-time table</a>.</li>
            <li><strong>Never reuse a password.</strong> One breach elsewhere should not unlock your email. Unique passwords are what a manager is for.</li>
            <li><strong>Use a passphrase for what you must type.</strong> Device logins and your password-manager vault are easier as six or more <a href="${href("passphrase")}">random words</a>.</li>
            <li><strong>Turn on two-factor authentication.</strong> Even a perfect password cannot protect you from a phished session on its own.</li>
            <li><strong>Change a password when there is a reason.</strong> A breach or a shared secret — not an arbitrary 90-day calendar rule.</li>
          </ul>
        </section>`,
      faq: [
        ["Are the generated passwords sent anywhere?", privacyAnswer],
        [
          "How long should my password be?",
          `For anything stored in a password manager, use 16 characters or more with all character types — that is over 100 bits of entropy and out of reach of brute force. For a password you have to type from memory, a passphrase of six or more words (about ${f.format1(6 * f.bitsPerWord.en)} bits) is a better trade between security and your patience.`,
        ],
        [
          "What does “entropy” actually mean?",
          "Entropy is a measure of unpredictability expressed in bits. Each additional bit doubles the number of guesses needed. FortiPass calls anything below 50 bits weak, 50 to 70 bits fair, 70 bits or more strong, and 90 bits or more excellent for essentially any threat model.",
        ],
        [
          "Is a passphrase of real words safe?",
          `Yes, provided the words are picked at random by a computer rather than by you. FortiPass selects from the ${words}-word EFF list using a cryptographic random number generator, so every word adds ${bpw} bits: six words is roughly ${f.format1(6 * f.bitsPerWord.en)} bits. The figure shown under your passphrase is calculated from the real list size, not guessed.`,
        ],
        [
          "Can I use FortiPass offline or install it?",
          "Yes. After the first visit the app is cached on your device, so it loads without a connection. Most browsers will also offer to install it — look for “Install app” or “Add to Home Screen”.",
        ],
        [
          "Does the strength checker upload what I type?",
          "No. The check runs on heuristics and entropy maths that ship with the page — dictionary words, a list of very common passwords, leet swaps, repeated blocks, keyboard sequences, years and character variety. Nothing is sent over the network, and the field is wiped when you leave the page.",
        ],
        [
          "Is FortiPass open source?",
          'Yes, under the MIT licence. The <a href="https://github.com/robertlib/forti-pass" rel="noopener">source code is on GitHub</a>, including the tests that check the randomness is uniform and the entropy maths exact.',
        ],
      ],
    },

    passphrase: {
      title: "Passphrase Generator – Random, Memorable Word Passwords | FortiPass",
      description: `Generate random passphrases from the ${words}-word EFF list right in your browser. Choose the words, separator, capitals and a number, and see the exact entropy. Free, offline, nothing sent.`,
      h1: "Passphrase generator",
      lede: "A few random words are easier to type and remember than line noise — and, chosen by a computer, just as hard to guess.",
      body: `<section class="content">
          <h2>Where a passphrase gets its strength</h2>
          <p>Strength comes from how the words are picked, not from how clever they look. FortiPass draws each word uniformly at random from the ${words}-word EFF large list with <code>crypto.getRandomValues()</code>, so every word adds log₂ ${words} ≈ ${bpw} bits — even if an attacker knows the list and your settings. Six words give about ${f.format1(6 * f.bitsPerWord.en)} bits; a number and a symbol add a few more.</p>
          ${c.passphraseTable("en", 3, 10)}
          <p>The crack times assume an offline attacker making 100 billion guesses per second against a fast hash — roughly one current high-end graphics card against MD5 or NTLM. An attacker with a rack of them is ten or a hundred times faster, so leave a margin. A site that stores passwords properly (bcrypt, scrypt or Argon2) slows any attacker down by many orders of magnitude.</p>

          <h2>Passphrase or random password?</h2>
          <ul class="tips">
            <li><strong>Use a passphrase for what you type by hand:</strong> your password manager's master password, your computer login, disk encryption, the Wi-Fi password you read out to guests.</li>
            <li><strong>Use a <a href="${href("home")}">random password</a> for everything a manager fills in:</strong> 16 or more random characters pack more bits into fewer keystrokes, and you never type them anyway.</li>
            <li><strong>Never pick the words yourself.</strong> People choose lyrics, quotes and words that belong together, and cracking dictionaries are full of them. The randomness is the whole point.</li>
          </ul>

          <h2>About the word list</h2>
          <p>The English list is the Electronic Frontier Foundation's large Diceware list: ${words} common, concrete words chosen to be easy to spell and remember (${words} = 6⁵, so five dice rolls pick one word). FortiPass removes the hyphen from four entries such as “t-shirt”, so that a hyphen separator always splits words unambiguously, and replaces the one duplicate this creates. Czech speakers can switch to the <a href="${href("passphrase", "cs")}" hreflang="cs" lang="cs">Czech version with Czech words</a>.</p>
        </section>`,
      faq: [
        [
          "How many words should a passphrase have?",
          `Five words (about ${f.format1(5 * f.bitsPerWord.en)} bits) is fine for most online accounts behind a properly run login. Use six or more (${f.format1(6 * f.bitsPerWord.en)} bits and up) for anything an attacker could test offline: a password manager's master password, disk encryption or an encrypted backup.`,
        ],
        [
          "The word list is public — doesn't that make it weaker?",
          `No. The entropy figure already assumes the attacker has the exact list and knows how many words you used. The security comes from the random choice: with six words there are ${words}⁶ ≈ 2.2 × 10²³ equally likely passphrases.`,
        ],
        [
          "Do separators, capitals or a number make it stronger?",
          `A little. Capitalising every word is a single rule (about 1 bit), a fixed separator adds nothing an attacker would not try, and a random digit adds about 3.3 bits. One more word (${bpw} bits) helps far more than any of them — they mostly exist to satisfy sites with composition rules.`,
        ],
        [
          "Is this the same as Diceware?",
          "Same idea and the same EFF list, with a cryptographic random number generator instead of dice. If you would rather trust physical dice, the EFF publishes the numbered list so you can roll your own.",
        ],
        ["Are the passphrases sent or saved anywhere?", privacyAnswer],
      ],
    },

    pin: {
      title: "PIN Generator – Random 4, 6 or 8-Digit PINs | FortiPass",
      description:
        "Generate truly random PIN codes of 3 to 16 digits with your browser's cryptographic randomness — no birthdays, no 1234. Bulk generation, free, offline, nothing sent.",
      h1: "Random PIN generator",
      lede: "No birthdays, no 1234 — every digit is picked by a cryptographic random number generator.",
      body: `<section class="content">
          <h2>How strong is a PIN?</h2>
          <p>Each digit adds log₂ 10 ≈ 3.3 bits, so even an 8-digit PIN has fewer combinations than a 6-character password. That is fine, because a PIN is not meant to survive an offline attack: it guards a card or device that locks, wipes or gets blocked after a few wrong tries.</p>
          ${c.pinTable([4, 5, 6, 8, 10, 12])}
          <p>The last column is the brute-force time with no lockout at all, for comparison with passwords. With a card blocked after three wrong attempts, a random 4-digit PIN gives a thief a 3 in 10,000 chance.</p>

          <h2>PINs to avoid</h2>
          <p>An analysis of 3.4 million leaked four-digit PINs by DataGenetics found that 1234 alone accounted for about one in ten, and the twenty most common PINs for over a quarter. Attackers try these first:</p>
          <ul class="tips">
            <li><strong>Sequences and repeats:</strong> 1234, 0000, 1111, 1212, 7777, 4321 and 2580 (straight down the keypad).</li>
            <li><strong>Dates:</strong> years such as 1985 or 2010, and birthdays written as DDMM or MMDD — easy to find on social media.</li>
            <li><strong>Your other numbers:</strong> the end of your phone number, your house number or an old PIN.</li>
          </ul>

          <h2>Using a generated PIN</h2>
          <ul class="tips">
            <li>Banks usually let you change a card PIN at a cash machine or in their app — generate it here, set it there.</li>
            <li>Choose 6 digits for a phone and anywhere else that allows it.</li>
            <li>Never write it on the card or keep it next to it; a password manager's secure notes are a better place.</li>
          </ul>
        </section>`,
      faq: [
        [
          "Is a 4-digit PIN secure enough?",
          "For a bank card that is blocked after three wrong attempts, yes — as long as it is random. For a phone, prefer 6 digits or a passphrase: a phone is a bigger prize and some allow more attempts.",
        ],
        [
          "Why does a random PIN sometimes look like a pattern?",
          "Truly random PINs include every combination equally often, 1212 and 0007 included. Filtering out “ugly” PINs would make the rest more predictable. If one looks too memorable for comfort, generate another.",
        ],
        [
          "Can I generate many PINs at once?",
          "Yes. Set “How many at once” up to 50, then copy them all or download them as a text file — handy for door codes, test data or one-time codes.",
        ],
        ["Is anything sent to a server?", privacyAnswer],
      ],
    },

    checker: {
      title: "Password Strength Checker – How Secure Is My Password? | FortiPass",
      description:
        "Test how strong a password really is: entropy, estimated crack time and the exact weaknesses — dictionary words, leet swaps, years, keyboard runs, repeats. Runs locally; nothing is sent.",
      h1: "Password strength checker",
      lede: "See your password the way a cracking tool does, and how long it would hold. Nothing you type leaves the page.",
      body: `<section class="content">
          <h2>How the check works</h2>
          <p>Most strength meters count character types and length. That rates <code>P@ssw0rd1!</code> as strong, though cracking tools guess it in seconds. FortiPass instead looks for the cheapest way to describe your password piece by piece, the way an attacker's rules engine does:</p>
          <ul class="tips">
            <li><strong>Dictionary words</strong> in English and Czech — also glued together, as in <code>correcthorse</code>, and with accents removed — plus very common passwords and names.</li>
            <li><strong>Predictable swaps</strong> such as @ for a, 0 for o and 1 for i or l.</li>
            <li><strong>Years and dates,</strong> repeated characters, keyboard and alphabet runs (<code>qwertz</code>, <code>4321</code>) and copies of an earlier part (<code>Ab3$Ab3$</code>).</li>
          </ul>
          <p>Each piece costs as many bits as it would take to guess, and the cheapest split wins. The result is shown as entropy in bits and as an average crack time for an offline attack at 100 billion guesses per second — the same assumption as the <a href="${href("crack")}">crack-time table</a>.</p>

          <h2>What it cannot know</h2>
          <p>No checker can know your pet's name, your street or the password you used in 2014. More importantly, it cannot tell whether a password has already <strong>leaked</strong>: a leaked password is cracked in zero seconds, however long it is. Checking that needs a database of breaches, which this page deliberately never contacts. Use <a href="https://haveibeenpwned.com/Passwords" rel="noopener">Have I Been Pwned</a> for that, and read a good score here as “no obvious weakness found”, not as a guarantee.</p>

          <h2>Turn a weak password into a strong one</h2>
          <ul class="tips">
            <li>Make it longer before you make it more complicated — length multiplies the search space fastest.</li>
            <li>Replace anything you made up with something random: a <a href="${href("passphrase")}">generated passphrase</a> if you have to type it, a <a href="${href("home")}">random password</a> if a password manager fills it in.</li>
            <li>Use it on one site only. Reuse is how one breach turns into many.</li>
          </ul>
        </section>`,
      faq: [
        [
          "Is it safe to type my real password here?",
          "The check runs entirely in your browser and the page's Content Security Policy blocks every network request, so nothing can be sent. Still, be wary of typing real passwords into any website — if in doubt, disconnect from the internet first, or test a password with the same structure instead.",
        ],
        [
          "Why does my password with symbols and numbers score low?",
          "Because the checker sees through the usual tricks. A dictionary word with a capital letter, a year and an exclamation mark is a pattern that cracking tools try in the first minutes. Length and genuine randomness are what make a password strong.",
        ],
        [
          "What does the crack time assume?",
          "An attacker who has stolen a database of password hashes and makes 100 billion guesses per second — about what one current high-end graphics card manages against a fast hash such as MD5 or NTLM. It is the average time, half the search space. A rig of several cards is proportionally faster; sites using bcrypt, scrypt or Argon2 make attacks far slower, and a login form with rate limiting slower still.",
        ],
        [
          "Does it check whether my password was in a data breach?",
          "No — that would mean sending something over the network, which FortiPass never does. Have I Been Pwned offers a breach check that only receives the first five characters of your password's SHA-1 hash.",
        ],
        [
          "Why do different checkers give different results?",
          "They assume different attackers (guesses per second, hash type) and different models of how passwords are made; many only count character classes. Compare the reasoning, not just the number.",
        ],
      ],
    },

    wifi: {
      title: "Wi-Fi Password Generator & QR Code – Guest Card | FortiPass",
      description:
        "Create a strong WPA2/WPA3 Wi-Fi password and a QR code guests can scan to join. Easy-to-type styles for TVs, a printable guest card and SVG download. Made in your browser, nothing sent.",
      h1: "Wi-Fi password generator with QR code",
      lede: "A strong password for your network, and a QR code guests scan to join instead of typing it.",
      body: `<section class="content">
          <h2>How to change your Wi-Fi password</h2>
          <ol class="steps">
            <li>Open your router's admin page — usually <code>192.168.0.1</code> or <code>192.168.1.1</code>, or the address on the sticker under the router — and sign in. Your provider's app may do the same job.</li>
            <li>Find the wireless (WLAN) settings and choose <strong>WPA2-Personal</strong> or <strong>WPA3-Personal</strong>, or the mixed WPA2/WPA3 mode if you have older devices.</li>
            <li>Paste the password generated above and save. Every device disconnects; reconnect them with the new password or by scanning the QR code.</li>
            <li>While you are there, change the router's own admin password if it is still the default.</li>
          </ol>

          <h2>Which style to choose</h2>
          <ul class="tips">
            <li><strong>20 letters and digits</strong> — about ${f.format0(f.wifiBits.easy)} bits, far beyond brute force, and with no look-alike characters, so typing it on a TV remote is bearable.</li>
            <li><strong>5 random words</strong> — about ${f.format0(f.wifiBits.words)} bits and easy to read out to a visitor. A WPA2 handshake can be attacked offline, so do not go below five words.</li>
            <li><strong>32 characters with symbols</strong> or <strong>63 characters</strong> — for networks no human types: smart-home gadgets, or an office network everyone joins with the QR code.</li>
          </ul>

          <h2>Is sharing Wi-Fi by QR code safe?</h2>
          <p>The QR code is simply the network name and password in a standard text format (<code>WIFI:T:WPA;S:…;P:…;;</code>) that phone cameras understand. Anyone who can photograph it can join, so treat a printed card like the password itself — on the fridge, not in the window. For visitors, consider a separate guest network that cannot reach your own devices.</p>
        </section>`,
      faq: [
        [
          "How long should a Wi-Fi password be?",
          "WPA2 and WPA3 accept 8 to 63 characters. Because a WPA2 handshake can be captured and attacked offline, use at least 16 random characters or 5 random words. WPA3 resists that offline attack, but most networks still let WPA2 devices in.",
        ],
        [
          "Does the QR code work on iPhone and Android?",
          "Yes. The built-in camera app recognises Wi-Fi QR codes on iPhone (iOS 11 and later) and on most Android phones (Android 10 and later, or through Google Lens).",
        ],
        [
          "Can I make a QR code for the password I already have?",
          "Yes. Type your network name, then replace the generated password with your own. The QR code updates as you type.",
        ],
        [
          "Is my network name or password sent anywhere?",
          "No. The password and the QR code are generated in your browser, and the page cannot make network requests. Nothing about your network is stored — only the password style and security type you picked.",
        ],
        [
          "WPA2 or WPA3?",
          "Use WPA3 if all your devices support it, otherwise the mixed WPA2/WPA3 mode. Avoid WEP and open networks: WEP can be cracked in minutes. The QR code works the same for WPA2 and WPA3.",
        ],
      ],
    },

    crack: {
      title: `How Long Does It Take to Crack a Password? ${f.year} Table | FortiPass`,
      description:
        "Brute-force crack times for random passwords of 4 to 20 characters in every character set, plus passphrases, at 100 billion guesses per second. Transparent maths, free to reuse.",
      h1: "How long does it take to crack a password?",
      lede: `Average brute-force times for truly random passwords, calculated from the size of the search space. Updated ${f.updated}.`,
      body: `<section class="content">
          <h2>Random passwords</h2>
          ${c.crackTable({
            caption: "Average brute-force time at 100 billion guesses per second",
            length: "Length",
            symbolsCount: "characters",
            pools: {
              digits: "Digits only",
              lower: "Lowercase",
              letters: "Upper &amp; lower case",
              alnum: "Letters &amp; digits",
              all: "Letters, digits &amp; symbols",
            },
          })}
          <p class="table-note">Colours follow the generator's verdicts: red is very weak, green is excellent. “Letters, digits &amp; symbols” uses the 28 symbols FortiPass generates.</p>

          <h2>Passphrases</h2>
          <p>Words picked at random from the ${words}-word EFF list add ${bpw} bits each — about as much as two random characters, and far easier to remember. Create one with the <a href="${href("passphrase")}">passphrase generator</a>.</p>
          ${c.passphraseTable("en", 3, 10)}

          <h2>How the numbers are calculated</h2>
          <p>A random password of length <var>L</var> drawn from <var>N</var> characters has <var>N</var><sup><var>L</var></sup> possibilities, or <var>L</var> × log₂ <var>N</var> bits. On average an attacker finds it after trying half of them. The table divides that by 10¹¹ — 100 billion guesses per second, roughly what a single current high-end graphics card manages against a fast, unsalted hash such as MD5 or NTLM after a database breach. A rig of eight such cards cuts every time in the table by about ten — worth about half a character of a random password.</p>
          <ul class="tips">
            <li><strong>Slow hashes help enormously.</strong> Sites that store passwords with bcrypt, scrypt or Argon2 hold attackers to thousands or millions of guesses per second, multiplying every time in the table by a hundred thousand or more.</li>
            <li><strong>Online attacks are slower still.</strong> A login form that limits attempts allows a handful of guesses per minute — but never rely on that: databases leak.</li>
            <li><strong>Hardware keeps getting faster.</strong> Leave a margin. A random 16-character password has plenty.</li>
          </ul>

          <h2>Why your password may fall much faster</h2>
          <p>The table is for random passwords. Passwords people make up — a word, a capital letter, a year, an exclamation mark — are attacked with dictionaries and rules rather than brute force, and fall in seconds whatever their length. A password that has already leaked is cracked instantly, because attackers try known passwords first. Test yours with the <a href="${href("checker")}">password strength checker</a>, or replace it with a <a href="${href("home")}">random one</a>.</p>

          <h2>Use this table</h2>
          <p>You are welcome to reproduce this table in articles, slides and training material — please credit <em>FortiPass</em> with a link to this page. The numbers are generated by the same <a href="https://github.com/robertlib/forti-pass" rel="noopener">open-source code</a> that powers the generator, so they always match what the app shows.</p>
        </section>`,
      faq: [
        [
          "How long does it take to crack an 8-character password?",
          `A random 8-character password using upper and lower case letters, digits and symbols takes about ${f.pw(8, 90)} at 100 billion guesses per second. With lowercase letters only, ${f.pw(8, 26)}. A human-chosen 8-character password usually falls to a dictionary attack in seconds.`,
        ],
        [
          "Is a 12-character password enough?",
          `A random 12-character password with all four character types needs about ${f.pw(12, 90)} on average, which is enough today. With lowercase letters only, ${f.pw(12, 26)}. For anything important, prefer 16 characters: ${f.pw(16, 90)}.`,
        ],
        [
          "How long does it take to crack a 4-word passphrase?",
          `With words drawn at random from a ${words}-word list, four words give ${f.format1(4 * f.bitsPerWord.en)} bits — about ${f.words(4, "en")}. Six words: ${f.words(6, "en")}.`,
        ],
        [
          "Why do other password tables show different times?",
          "Published tables differ mainly in the hash they assume and the hardware they count. A fast hash on graphics cards gives short times like the ones here (shorter still on a rig of many cards); a slow hash such as bcrypt gives far longer ones. The shape is the same in every table: each extra character multiplies the time by the size of the character set.",
        ],
        [
          "Does adding a symbol make a password much stronger?",
          `Less than adding length. At 12 characters, going from letters and digits to all four types adds about ${f.format1(12 * Math.log2(90) - 12 * Math.log2(62))} bits; adding two more letters or digits instead adds about ${f.format1(2 * Math.log2(62))}.`,
        ],
      ],
    },
  };
};
