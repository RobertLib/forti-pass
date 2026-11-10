"use strict";

/* The tools and generated tables. Element ids are the contract with
   script.js — rename one here and it must change there too (the site tests
   check every id script.js asks for on each page type).

   Every tool is one card: an optional header strip, then a body of one or
   two panes — the result on the left, the controls on the right — that
   stack on narrow screens. */

const { esc, icon } = require("./html");

/**
 * A table card: the caption sits above the horizontal scroller, so on a
 * phone it wraps to the screen instead of scrolling away with the columns.
 * The scroller is a focusable region, so keyboard users can scroll it too.
 */
function tableCard(id, caption, className, head, rows) {
  return `<figure class="table-wrap">
            <figcaption class="table-caption" id="${id}">${caption}</figcaption>
            <div class="table-scroll" tabindex="0" role="region" aria-labelledby="${id}">
              <table class="${className}" aria-labelledby="${id}">
                <thead>${head}</thead>
                <tbody>
                  ${rows.join("\n                  ")}
                </tbody>
              </table>
            </div>
          </figure>`;
}

function meter(id, score, label, extra) {
  const ids = extra || {};
  return `<div class="meter" id="${id}" data-score="${score}">
              <div class="meter-track" role="meter" aria-label="${esc(ids.name)}" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${score}" aria-valuetext="${esc(label)}" id="${id}Track">
                <span class="seg"></span><span class="seg"></span><span class="seg"></span><span class="seg"></span><span class="seg"></span>
              </div>
              <div class="meter-meta">
                <strong class="strength-label" id="${ids.label}">${label}</strong>
                <span class="meta-item"${ids.bitsTitle ? ` title="${esc(ids.bitsTitle)}"` : ""}>
                  ${icon("i-gauge", "icon-sm")}
                  <span${ids.bitsId ? ` id="${ids.bitsId}"` : ""}>—</span>
                </span>
                <span class="meta-item"${ids.crackTitle ? ` title="${esc(ids.crackTitle)}"` : ""}>
                  ${icon("i-clock", "icon-sm")}
                  <span${ids.crackId ? ` id="${ids.crackId}"` : ""}>—</span>
                </span>
              </div>${ids.live ? `\n              <p class="sr-only" id="liveStatus" role="status" aria-live="polite"></p>` : ""}
            </div>`;
}

function switchRow(id, label, note, checked) {
  return `<label class="switch">
                  <input type="checkbox" id="${id}"${checked ? " checked" : ""} />
                  <span class="switch-track" aria-hidden="true"></span>
                  <span class="switch-text">
                    <span>${label}</span>${note ? `\n                    <small>${note}</small>` : ""}
                  </span>
                </label>`;
}

function select(id, options, describedBy) {
  return `<div class="select-wrap">
                <select id="${id}" class="select"${describedBy ? ` aria-describedby="${describedBy}"` : ""}>
                  ${options.join("\n                  ")}
                </select>
                ${icon("i-chevron", "select-icon")}
              </div>`;
}

function toggle(id, sample, label) {
  return `<label class="toggle">
                  <input type="checkbox" id="${id}" checked />
                  <span class="toggle-body">
                    <span class="toggle-sample" aria-hidden="true">${sample}</span>
                    <span class="toggle-title">${label}</span>
                  </span>
                </label>`;
}

function presets(t, list) {
  if (!list || !list.length) return "";
  return `<div class="field">
              <span class="field-label" id="presetsLabel">${t.presetsLabel}</span>
              <div class="chips" id="presets" role="group" aria-labelledby="presetsLabel">
                ${list
                  .map(([id, label]) => `<button type="button" class="chip" data-preset="${id}" aria-pressed="false">${label}</button>`)
                  .join("\n                ")}
              </div>
            </div>`;
}

/** Password / Passphrase / PIN: links to the three generator pages. */
function modeSwitch(t, ctx) {
  const pages = { password: "home", passphrase: "passphrase", pin: "pin" };
  const items = Object.keys(pages).map((mode) => {
    const target = ctx.pages.find((page) => page.id === pages[mode]);
    const current = mode === ctx.page.mode;
    return `<a class="segment" href="${ctx.href(target)}" data-mode="${mode}"${current ? ' aria-current="page"' : ""}>${
      current ? '<span class="segment-pill" aria-hidden="true"></span>' : ""
    }<span class="segment-label">${t.tabs[mode]}</span></a>`;
  });
  return `<nav class="segmented" aria-label="${esc(t.modeLabel)}">
            ${items.join("\n            ")}
          </nav>`;
}

function passwordSettings(t) {
  return `<div class="field">
              <div class="field-head">
                <label for="length">${t.length}</label>
                <input type="number" id="length" class="num-input" min="4" max="128" value="16" inputmode="numeric" aria-label="${esc(t.lengthInput)}" />
              </div>
              <input type="range" id="lengthRange" min="4" max="64" step="1" value="16" aria-label="${esc(t.lengthSlider)}" />
              <p class="hint">${t.lengthHint}</p>
            </div>

            <fieldset class="field">
              <legend class="field-label">${t.charTypes}</legend>
              <div class="toggle-grid">
                ${toggle("uppercase", "ABC", t.uppercase)}
                ${toggle("lowercase", "abc", t.lowercase)}
                ${toggle("numbers", "123", t.numbers)}
                ${toggle("symbols", "#$&amp;", t.symbols)}
              </div>
            </fieldset>

            ${presets(t, t.presets.password)}

            <details class="advanced" id="advanced">
              <summary>
                <span class="summary-text">${t.advanced}<span class="summary-hint">${t.advancedHint}</span></span>
                ${icon("i-chevron", "icon-sm summary-chevron")}
              </summary>
              <div class="advanced-body">
                ${switchRow("requireEach", t.requireEach, t.requireEachNote, true)}
                ${switchRow("excludeAmbiguous", t.excludeAmbiguous, t.excludeAmbiguousNote, false)}
                ${switchRow("noRepeats", t.noRepeats, t.noRepeatsNote, false)}
                <div class="field">
                  <label for="excludeChars">${t.excludeChars}</label>
                  <input type="text" id="excludeChars" class="text-input mono" placeholder="${esc(t.excludeCharsPlaceholder)}" autocomplete="off" spellcheck="false" aria-describedby="excludeCharsHint" />
                  <p class="hint" id="excludeCharsHint">${t.excludeCharsHint}</p>
                </div>
              </div>
            </details>`;
}

function passphraseSettings(t, ctx) {
  const wordBits = ctx.facts.format1(ctx.facts.bitsPerWord[ctx.lang] || ctx.facts.bitsPerWord.en);
  const languages = ctx.languages;
  const languagePicker =
    languages.length > 1
      ? `
            <div class="field">
              <label for="wordLanguage">${t.wordLanguage}</label>
              ${select(
                "wordLanguage",
                languages.map(
                  (code) => `<option value="${code}">${t.languageNames[code]} · ${ctx.facts.formatInt(ctx.facts.wordCounts[code])}</option>`
                )
              )}
            </div>
`
      : "";
  const asciiSwitch = languages.indexOf("cs") !== -1 ? switchRow("asciiOnly", t.asciiOnly, t.asciiOnlyNote, true) + "\n              " : "";

  return `<div class="field">
              <div class="field-head">
                <label for="wordCountValue">${t.words}</label>
                <input type="number" id="wordCountValue" class="num-input" min="3" max="12" value="6" inputmode="numeric" />
              </div>
              <input type="range" id="wordCount" min="3" max="12" step="1" value="6" aria-label="${esc(t.wordsSlider)}" />
              <p class="hint">${t.wordsHint(wordBits)}</p>
            </div>
${languagePicker}
            <div class="field">
              <label for="separator">${t.separator}</label>
              ${select(
                "separator",
                t.separators.map(([value, label, example]) => `<option value="${esc(value)}">${label} · ${example}</option>`)
              )}
            </div>

            <div class="switch-list">
              ${asciiSwitch}${switchRow("capitalize", t.capitalize, t.capitalizeExample, true)}
              ${switchRow("addNumber", t.addNumber, t.addNumberNote, true)}
              ${switchRow("addSymbol", t.addSymbol, t.addSymbolNote, false)}
            </div>`;
}

function pinSettings(t) {
  return `<div class="field">
              <div class="field-head">
                <label for="pinLengthValue">${t.digits}</label>
                <input type="number" id="pinLengthValue" class="num-input" min="3" max="16" value="6" inputmode="numeric" />
              </div>
              <input type="range" id="pinLength" min="3" max="16" step="1" value="6" aria-label="${esc(t.digitsSlider)}" />
              <p class="hint">${t.pinHint}</p>
            </div>

            ${presets(t, t.presets.pin)}`;
}

function generator(t, ctx) {
  const mode = ctx.page.mode;
  const settings = { password: passwordSettings, passphrase: passphraseSettings, pin: pinSettings }[mode](t, ctx);

  return `<section class="tool generator" id="generator" data-mode="${mode}" aria-labelledby="generatorHeading">
          <h2 class="sr-only" id="generatorHeading">${t.toolNames[ctx.page.id]}</h2>

          <div class="tool-head">
          ${modeSwitch(t, ctx)}
          </div>

          <div class="tool-body">
            <div class="pane result-pane">
              <div class="result" id="result">
                <button type="button" class="password-display" id="heroPassword" title="${esc(t.clickToCopy)}" data-copy></button>
                <ol class="password-list bulk-list" id="passwordList" hidden></ol>
              </div>

              <div class="result-actions">
                <button type="button" class="btn btn-primary" id="copyBtn" title="${esc(t.copyTitle)}" data-copy>
                  ${icon("i-copy")}
                  <span class="btn-label">${t.copy}</span>
                </button>
                <button type="button" class="btn" id="refreshBtn" title="${esc(t.newTitle)}">
                  ${icon("i-refresh", "icon-spin-target")}
                  <span class="btn-label">${t.new}</span>
                </button>
                <button type="button" class="icon-btn" id="downloadBtn" aria-label="${esc(t.download)}" title="${esc(t.download)}" hidden>
                  ${icon("i-download")}
                </button>
                <button type="button" class="icon-btn" id="maskBtn" aria-pressed="false" aria-label="${esc(t.hide)}" title="${esc(t.hideTitle)}">
                  ${icon("i-eye-off")}
                </button>
              </div>

              ${meter("meter", 0, "—", {
                name: t.strengthMeter,
                label: "strengthLabel",
                bitsId: "entropyText",
                crackId: "crackText",
                bitsTitle: t.entropyTitle,
                crackTitle: t.crackTitle,
                live: true,
              })}

              <label class="switch switch-sm">
                <input type="checkbox" id="clearClipboard" />
                <span class="switch-track" aria-hidden="true"></span>
                <span class="switch-text">
                  <span>${t.clearClipboard}</span>
                  <small>${t.clearClipboardNote}</small>
                </span>
              </label>

              <details class="recent" id="historyCard" hidden>
                <summary>
                  ${icon("i-history", "icon-sm")}
                  <span>${t.historyHeading}</span>
                  <span class="count-badge" id="historyCount">0</span>
                  ${icon("i-chevron", "icon-sm summary-chevron")}
                </summary>
                <div class="recent-body">
                  <p class="hint">${t.historySub}</p>
                  <ul class="password-list" id="historyList"></ul>
                  <button type="button" class="btn btn-sm btn-quiet" id="clearHistoryBtn">
                    ${icon("i-trash", "icon-sm")}
                    ${t.clear}
                  </button>
                </div>
              </details>
            </div>

            <div class="pane settings-pane">
            ${settings}

            <div class="field field-count">
              <div class="field-text">
                <label for="count">${t.count}</label>
                <p class="hint">${t.countHint}</p>
              </div>
              <div class="stepper">
                <button type="button" class="stepper-btn" id="countDown" aria-label="${esc(t.fewer)}">${icon("i-minus", "icon-sm")}</button>
                <input type="number" id="count" min="1" max="50" value="1" inputmode="numeric" />
                <button type="button" class="stepper-btn" id="countUp" aria-label="${esc(t.more)}">${icon("i-plus", "icon-sm")}</button>
              </div>
            </div>
            </div>
          </div>
        </section>`;
}

function checker(t, ctx) {
  const home = ctx.href(ctx.pages.find((page) => page.id === "home"));
  return `<section class="tool checker" id="checker" aria-labelledby="checkerHeading">
          <h2 class="sr-only" id="checkerHeading">${t.checkerHeading}</h2>
          <div class="tool-body">
            <div class="pane">
              <div class="field">
                <label for="checkInput">${t.checkLabel}</label>
                <div class="input-row">
                  <input type="password" id="checkInput" class="text-input input-lg mono" placeholder="${esc(t.checkPlaceholder)}" maxlength="256" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore aria-describedby="checkVerdict checkPrivacy" />
                  <button type="button" class="icon-btn" id="checkRevealBtn" aria-label="${esc(t.showPassword)}" aria-pressed="false">
                    ${icon("i-eye")}
                  </button>
                </div>
              </div>

              ${meter("checkMeter", 0, t.waiting, { name: t.strengthMeter, label: "checkVerdict", bitsId: "checkEntropy", crackId: "checkCrack", bitsTitle: t.entropyTitle, crackTitle: t.crackTitle })}
              <p class="sr-only" id="checkStatus" role="status" aria-live="polite"></p>

              <p class="privacy-note" id="checkPrivacy">${icon("i-lock", "icon-sm")}<span>${t.checkPrivacy}</span></p>
            </div>

            <div class="pane">
              <h3 class="pane-title">${t.findingsHeading}</h3>
              <ul class="findings" id="checkFindings"></ul>
              <p class="findings-empty">${t.findingsEmpty}</p>
              <p class="cta">${t.checkerCta} <a href="${home}">${t.checkerCtaLink}${icon("i-arrow", "icon-sm")}</a></p>
            </div>
          </div>
        </section>`;
}

function wifi(t) {
  return `<section class="tool wifi" id="wifi" aria-labelledby="wifiHeading">
          <h2 class="sr-only" id="wifiHeading">${t.wifiHeading}</h2>
          <div class="tool-body">
            <div class="pane wifi-form">
              <div class="field">
                <label for="wifiSsid">${t.ssid}</label>
                <input type="text" id="wifiSsid" class="text-input" maxlength="32" placeholder="${esc(t.ssidPlaceholder)}" autocomplete="off" autocapitalize="off" spellcheck="false" />
              </div>

              <div class="field">
                <label for="wifiSecurity">${t.security}</label>
                ${select("wifiSecurity", t.securityOptions.map(([v, l]) => `<option value="${v}">${l}</option>`))}
              </div>

              <div class="field-group" id="wifiPasswordField">
                <div class="field">
                  <label for="wifiStyle">${t.wifiStyle}</label>
                  ${select("wifiStyle", t.wifiStyles.map(([v, l]) => `<option value="${v}">${l}</option>`))}
                </div>

                <div class="field">
                  <label for="wifiPassword">${t.wifiPassword}</label>
                  <div class="input-row">
                    <input type="text" id="wifiPassword" class="text-input mono" maxlength="64" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore aria-describedby="wifiPasswordHint wifiHint" />
                    <button type="button" class="icon-btn" id="wifiNewBtn" aria-label="${esc(t.new)}" title="${esc(t.newTitle)}">
                      ${icon("i-refresh")}
                    </button>
                    <button type="button" class="icon-btn" id="wifiCopyBtn" aria-label="${esc(t.copy)}" title="${esc(t.copyTitle)}" data-copy>
                      ${icon("i-copy")}
                    </button>
                  </div>
                  <p class="hint" id="wifiPasswordHint">${t.wifiPasswordHint}</p>
                </div>

                ${meter("wifiMeter", 0, t.waiting, { name: t.strengthMeter, label: "wifiVerdict", bitsTitle: t.entropyTitle, crackTitle: t.crackTitle })}
              </div>

              ${switchRow("wifiHidden", t.hiddenNetwork, t.hiddenNetworkNote, false)}

              <p class="notice" id="wifiHint" role="status" aria-live="polite"></p>
              <a class="btn btn-sm qr-jump" id="wifiJump" href="#wifiCard" hidden>${icon("i-arrow", "icon-sm")}${t.showQr}</a>
            </div>

            <div class="pane wifi-side">
              <h3 class="pane-title screen-only">${t.wifiPreview}</h3>
              <figure class="wifi-card" id="wifiCard">
                <div class="wifi-card-head">${icon("i-wifi")}<span>Wi-Fi</span></div>
                <div class="qr-frame">
                  <svg class="qr" id="wifiQr" viewBox="0 0 29 29" role="img" aria-label="${esc(t.qrLabel)}" shape-rendering="crispEdges" hidden>
                    <rect class="qr-bg" width="100%" height="100%" />
                    <path class="qr-fg" id="wifiQrPath" d="" />
                  </svg>
                  <p class="qr-empty" id="wifiQrEmpty"></p>
                </div>
                <dl class="wifi-details">
                  <div><dt>${t.printNetwork}</dt><dd id="wifiPrintSsid"></dd></div>
                  <div id="wifiPrintPasswordRow"><dt>${t.printPassword}</dt><dd id="wifiPrintPassword" class="mono"></dd></div>
                </dl>
                <figcaption>${t.printNote}</figcaption>
              </figure>
              <div class="wifi-actions screen-only">
                <button type="button" class="btn btn-primary" id="wifiPrintBtn">${icon("i-print")} ${t.printCard}</button>
                <button type="button" class="btn" id="wifiSaveBtn">${icon("i-download")} ${t.saveQr}</button>
              </div>
              <p class="privacy-note screen-only">${icon("i-lock", "icon-sm")}<span>${t.wifiPrivacy}</span></p>
            </div>
          </div>
        </section>`;
}

/** Brute-force crack times for random passwords: length × character set. */
function crackTable(ctx, labels) {
  const { core, lengths, pools } = ctx.facts.table;
  const head = pools
    .map((pool) => `<th scope="col">${labels.pools[pool.id]}<span class="th-sub">${ctx.facts.formatInt(pool.size)} ${labels.symbolsCount}</span></th>`)
    .join("");
  const rows = lengths.map((length) => {
    const cells = pools
      .map((pool) => {
        const bits = length * Math.log2(pool.size);
        return `<td data-score="${core.scoreFromBits(bits)}">${ctx.facts.crackTime(bits)}</td>`;
      })
      .join("");
    return `<tr><th scope="row">${length}</th>${cells}</tr>`;
  });
  return tableCard(
    "crackTableCaption",
    labels.caption,
    "crack-table",
    `<tr><th scope="col">${labels.length}</th>${head}</tr>`,
    rows
  );
}

/** Crack times for passphrases from one word list, by number of words. */
function passphraseTable(ctx, labels, language, from, to) {
  const { core } = ctx.facts.table;
  const size = ctx.facts.wordCounts[language];
  const rows = [];
  for (let words = from; words <= to; words++) {
    const bits = words * Math.log2(size);
    rows.push(
      `<tr><th scope="row">${words}</th><td>${ctx.facts.format1(bits)}</td><td data-score="${core.scoreFromBits(bits)}">${ctx.facts.crackTime(bits)}</td></tr>`
    );
  }
  return tableCard(
    "passphraseTableCaption-" + language,
    labels.caption,
    "crack-table crack-table-narrow",
    `<tr><th scope="col">${labels.words}</th><th scope="col">${labels.bits}</th><th scope="col">${labels.time}</th></tr>`,
    rows
  );
}

/** PIN keyspace by number of digits. */
function pinTable(ctx, labels, lengths) {
  const { core } = ctx.facts.table;
  const rows = lengths.map((digits) => {
    const bits = digits * Math.log2(10);
    return `<tr><th scope="row">${digits}</th><td>${ctx.facts.formatInt(Math.pow(10, digits))}</td><td>${ctx.facts.format1(bits)}</td><td data-score="${core.scoreFromBits(bits)}">${ctx.facts.crackTime(bits)}</td></tr>`;
  });
  return tableCard(
    "pinTableCaption",
    labels.caption,
    "crack-table",
    `<tr><th scope="col">${labels.digits}</th><th scope="col">${labels.combinations}</th><th scope="col">${labels.bits}</th><th scope="col">${labels.time}</th></tr>`,
    rows
  );
}

module.exports = { generator, checker, wifi, crackTable, passphraseTable, pinTable };
