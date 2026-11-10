/* ==========================================================================
   FortiPass — Czech strings for core.js (verdicts, errors, crack times) and
   script.js (buttons, toasts, screen-reader announcements). Loaded before
   both on the /cs/ pages; the static-site build uses it too, for the
   crack-time table.
   ========================================================================== */

(function (root) {
  "use strict";

  /** Czech has three plural forms: 1, 2–4 and the rest (including 0). */
  function form(n, one, few, many) {
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return few;
    return many;
  }
  const count = (n, one, few, many) => n + " " + form(n, one, few, many);
  const decimal = (value) => String(value).replace(".", ",");

  const UNITS = {
    second: ["sekunda", "sekundy", "sekund"],
    minute: ["minuta", "minuty", "minut"],
    hour: ["hodina", "hodiny", "hodin"],
    day: ["den", "dny", "dní"],
    year: ["rok", "roky", "let"],
  };

  // English short scale → Czech long scale: a billion is a "miliarda".
  // The last entry is what a decimal ("2,5 milionu") takes.
  const SCALES = {
    thousand: ["tisíc", "tisíce", "tisíc", "tisíce"],
    million: ["milion", "miliony", "milionů", "milionu"],
    billion: ["miliarda", "miliardy", "miliard", "miliardy"],
    trillion: ["bilion", "biliony", "bilionů", "bilionu"],
    quadrillion: ["biliarda", "biliardy", "biliard", "biliardy"],
  };

  const NOUNS = {
    password: {
      forms: ["heslo", "hesla", "hesel"],
      fresh: "Vygenerováno nové heslo",
      hidden: "Skryté heslo",
    },
    passphrase: {
      forms: ["heslo ze slov", "hesla ze slov", "hesel ze slov"],
      fresh: "Vygenerováno nové heslo ze slov",
      hidden: "Skryté heslo ze slov",
    },
    pin: { forms: ["PIN", "PINy", "PINů"], fresh: "Vygenerován nový PIN", hidden: "Skrytý PIN" },
  };

  const locale = {
    lang: "cs",

    core: {
      scoreLabels: ["", "Velmi slabé", "Slabé", "Průměrné", "Silné", "Výborné"],
      errors: {
        noTypes: "Vyberte aspoň jeden typ znaků.",
        allExcluded:
          "Všechny znaky vybraných typů jsou vyloučené — některá vyloučení odeberte.",
        notEnoughUnique: (n) =>
          "K dispozici je jen " +
          count(n, "různý znak", "různé znaky", "různých znaků") +
          " — zkraťte heslo nebo povolte opakování.",
        unsatisfiable: "Tyto volby nejde splnit — prodlužte heslo nebo je uvolněte.",
        tooRestrictive:
          "Volby jsou příliš přísné — prodlužte heslo nebo povolte víc znaků.",
        noWordList: "Seznam slov se nenačetl — obnovte stránku.",
      },
      time: {
        instantly: "okamžitě",
        count: (n, unit) => count(n, UNITS[unit][0], UNITS[unit][1], UNITS[unit][2]),
        scaled: (value, scale) => {
          const words = SCALES[scale];
          const noun = Number.isInteger(value)
            ? form(value, words[0], words[1], words[2])
            : words[3];
          return decimal(value) + " " + noun + " let";
        },
        power: (exponent) => "10^" + exponent + " let",
      },
      findings: {
        mostGuessed:
          "Tohle je jedno z nejčastějších hesel vůbec — změňte ho všude, kde ho používáte.",
        dressedUp:
          "Známé heslo převlečené předvídatelnými úpravami (@ místo a, 0 místo o, oddělovače, číslo na konci). Programy na lámání hesel zkoušejí právě tohle jako první.",
        tooShort: (n) =>
          "Jen " + count(n, "znak", "znaky", "znaků") + ". Cokoli pod 8 znaků padne nanejvýš během minut.",
        short: (n) => count(n, "znak", "znaky", "znaků") + " je málo. Mířte na 16 a víc.",
        goodLength: (n) => count(n, "znak", "znaky", "znaků") + " je dobrá délka.",
        commonName:
          "Obsahuje velmi časté heslo nebo jméno — útočníci ho mají ve slovnících a zkoušejí ho první.",
        singleWord:
          "Stojí na jediném slově ze slovníku — slovníkový útok ho prolomí mnohem rychleji, než napovídá jeho délka.",
        words: (n) =>
          "Rozpoznáno jako " +
          count(n, "slovo", "slova", "slov") +
          " ze slovníku, proto se hodnotí po slovech, ne po znacích.",
        copy: "Opakuje svou dřívější část — zopakovaný blok skoro nic nepřidá.",
        repeatChar: "Obsahuje znak zopakovaný třikrát a víckrát za sebou.",
        run: "Obsahuje řadu z klávesnice nebo abecedy, třeba „abcd“, „1234“, „qwer“ nebo „1qaz“.",
        year: "Zřejmě obsahuje rok — narozeniny a data útočníci zkoušejí brzy.",
        fewTypes: (n) =>
          "Používá jen " +
          count(n, "typ znaků", "typy znaků", "typů znaků") +
          ". Velká písmena, číslice a symboly znásobí počet možností.",
        allTypes: "Používá všechny čtyři typy znaků.",
        nothingToImprove:
          "Nic zjevného ke zlepšení — jen ho nikdy nepoužívejte na jiném webu.",
      },
    },

    ui: {
      generated: (n, mode, summary, bits) =>
        (n > 1
          ? "Vygenerováno: " + count(n, ...NOUNS[mode].forms) + "."
          : NOUNS[mode].fresh + ".") +
        " " +
        summary +
        ", " +
        count(bits, "bit", "bity", "bitů") +
        ".",
      hiddenHero: (mode, length) =>
        NOUNS[mode].hidden + ", " + count(length, "znak", "znaky", "znaků") + ". Kliknutím zkopírujete.",
      clickToCopy: "Kliknutím zkopírujete",
      hiddenRow: (i) => "Skrytá hodnota " + i + ". Kliknutím zkopírujete.",
      hiddenFrom: (time) => "Skrytá hodnota z " + time + ". Kliknutím zkopírujete.",
      replace: "Vygenerovat náhradu",
      copy: "Kopírovat",
      copyAll: "Kopírovat vše",
      copied: "Zkopírováno",
      notGenerated: "Nevygenerováno",
      waiting: "Čekám na zadání",
      bits: (n) => count(n, "bit", "bity", "bitů"),
      strength: (label) => "Síla: " + label.toLowerCase(),
      combinations: (n) => n.toLocaleString("cs") + " " + form(n, "kombinace", "kombinace", "kombinací"),
      toCrack: (time) =>
        time === "okamžitě" ? "prolomení okamžitě" : time + " na prolomení",
      noCrypto:
        "Tento prohlížeč nemá bezpečný generátor náhodných čísel, takže FortiPass heslo nevytvoří.",
      generationFailed: "S těmito volbami se generování nepovedlo — zkuste je uvolnit.",
      copiedToast: "Zkopírováno do schránky",
      copiedClears: (s) => "Zkopírováno — schránka se vymaže za " + s + " s",
      clipboardCleared: "Schránka vymazána",
      downloadHeader: (date) =>
        "# FortiPass — vygenerováno " +
        date +
        "\n# Uložte je do správce hesel a tento soubor smažte.\n\n",
      downloadToast: "Uloženo jako textový soubor — po bezpečném uložení ho smažte",
      historyCleared: "Seznam z této relace vymazán",
      wifiNeedName: "Zadejte název sítě a QR kód se objeví tady.",
      wifiProblem: {
        short: "Heslo k Wi-Fi musí mít aspoň 8 znaků, jinak ho router nepřijme.",
        long: "Heslo k Wi-Fi může mít nejvýš 63 znaků.",
        ascii:
          "Heslo k Wi-Fi smí obsahovat jen znaky bez diakritiky (ASCII), jinak se k síti nepřipojí všechna zařízení.",
      },
      wifiOk: "Router heslo přijme. QR kód obsahuje název sítě i heslo — sdílejte ho jen s lidmi, kterým věříte.",
      wifiOpen: "Otevřená síť bez hesla — kdokoli v dosahu vidí, co se po ní posílá.",
      wifiSaved: "QR kód uložen jako obrázek SVG",
    },
  };

  if (typeof module === "object" && module.exports) module.exports = locale;
  else root.FortiPassLocale = locale;
})(typeof self !== "undefined" ? self : globalThis);
