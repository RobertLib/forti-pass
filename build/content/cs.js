"use strict";

/* Czech page content — written for Czech readers, not translated line by
   line: Czech word lists, datová schránka, Czech keyboards. Every figure
   comes from `f` (computed with core.js and locale-cs.js). */

module.exports = function content(f, href, c) {
  const csWords = f.formatInt(f.wordCounts.cs);
  const enWords = f.formatInt(f.wordCounts.en);
  const bpw = f.format1(f.bitsPerWord.cs);
  const six = f.format1(6 * f.bitsPerWord.cs);


  const privacyAnswer =
    "Ne. Všechno vzniká v kartě vašeho prohlížeče pomocí Web Crypto API a bezpečnostní politika stránky (Content Security Policy) zakazuje jakýkoli síťový požadavek — otevřete si v prohlížeči panel Síť a uvidíte, že zůstane prázdný. Na zařízení se ukládá jen vaše nastavení, vygenerované hodnoty nikdy.";

  return {
    home: {
      title: "Generátor hesel – silná hesla offline a zdarma | FortiPass",
      ogTitle: "FortiPass – generátor silných hesel a hesel ze slov",
      description:
        "Generátor silných hesel, hesel z českých slov a PINů, který běží jen ve vašem prohlížeči. Poctivý výpočet entropie a doby prolomení, kontrola síly hesla. Zdarma, bez registrace, funguje offline.",
      h1: "Generátor silných hesel",
      lede: "Náhodná hesla z kryptografické náhody vašeho prohlížeče, s poctivým odhadem síly. Nic, co vygenerujete, neopustí toto zařízení.",
      body: `<section class="content" aria-labelledby="whyHeading">
          <h2 id="whyHeading">Proč FortiPass</h2>
          <div class="feature-grid">
            <article class="feature">
              <h3>Skutečná kryptografická náhoda</h3>
              <p>Každý znak pochází z <code>crypto.getRandomValues()</code> s odmítacím vzorkováním, takže výsledek není zkreslený ani předvídatelný — na rozdíl od generátorů postavených na <code>Math.random()</code>.</p>
            </article>
            <article class="feature">
              <h3>Poctivá čísla o síle</h3>
              <p>Místo vágního štítku „silné“ uvidíte skutečnou entropii v bitech a odhad, jak dlouho by heslo lámal útočník se 100 miliardami pokusů za sekundu.</p>
            </article>
            <article class="feature">
              <h3>Nic neopustí vaše zařízení</h3>
              <p>Žádné účty, žádná analytika, žádné síťové požadavky. Nastavení se ukládá jen u vás, aby byl generátor příště připravený; samotná hesla se neukládají nikdy.</p>
            </article>
            <article class="feature">
              <h3>Česká slova i klávesnice</h3>
              <p>Hesla ze slov umí vlastní seznam ${csWords} českých slov, s diakritikou i bez ní. Kontrola síly zná česká slova, jména a nejčastější česká hesla.</p>
            </article>
          </div>

          <h2>Jak vybrat dobré heslo</h2>
          <ul class="tips">
            <li><strong>Délka je víc než složitost.</strong> Náhodné heslo o 16 znacích by útočník lámal ${f.pw(16, 90)}, heslo o 8 znacích ${f.pw(8, 90)}. Podívejte se na <a href="${href("crack")}">celou tabulku doby prolomení</a>.</li>
            <li><strong>Nikdy nepoužívejte stejné heslo dvakrát.</strong> Únik dat z jednoho e-shopu nesmí odemknout váš e-mail. Právě na jedinečná hesla je správce hesel.</li>
            <li><strong>Co píšete ručně, ať je ze slov.</strong> Přihlášení do počítače nebo hlavní heslo správce hesel se lépe píše jako šest a víc <a href="${href("passphrase")}">náhodných slov</a>.</li>
            <li><strong>Zapněte dvoufázové ověření.</strong> Ani dokonalé heslo vás samo neochrání před phishingem.</li>
            <li><strong>Heslo měňte, když je důvod.</strong> Únik nebo sdílení — ne kalendář, který nařizuje změnu každých 90 dní.</li>
          </ul>

          <h2>Heslo pro datovou schránku</h2>
          <p>Datová schránka vyžaduje aspoň jedno velké písmeno, malé písmeno a číslici, nepovoluje některé symboly (například <code>^ ; &lt; &gt; /</code>) ani tři stejné znaky za sebou a starší pravidla omezují délku na 32 znaků. Předvolba <strong>Datová schránka</strong> v generátoru výše tohle všechno splní: vytvoří 24 znaků bez zakázaných symbolů a bez opakování.</p>
        </section>`,
      faq: [
        ["Posílají se vygenerovaná hesla někam?", privacyAnswer],
        [
          "Jak dlouhé má heslo být?",
          `Pro všechno, co ukládáte do správce hesel, použijte 16 a víc znaků všech typů — to je přes 100 bitů entropie, mimo dosah útoku hrubou silou. Pro heslo, které musíte psát zpaměti, je lepší heslo ze šesti a více slov (asi ${six} bitu).`,
        ],
        [
          "Co přesně znamená „entropie“?",
          "Entropie vyjadřuje nepředvídatelnost hesla v bitech. Každý bit navíc zdvojnásobí počet pokusů, které útočník potřebuje. FortiPass označuje méně než 50 bitů za slabé, 50 až 70 bitů za průměrné, 70 a víc za silné a 90 a víc za výborné prakticky pro jakoukoli hrozbu.",
        ],
        [
          "Je heslo ze skutečných slov bezpečné?",
          `Ano, pokud slova vybere náhodně počítač, a ne vy. FortiPass je vybírá kryptografickým generátorem ze seznamu ${csWords} českých nebo ${enWords} anglických slov, takže každé slovo přidá ${bpw} bitu a šest slov dá zhruba ${six} bitu. Číslo pod heslem se počítá ze skutečné velikosti seznamu.`,
        ],
        [
          "Jaké heslo vyhoví datové schránce?",
          "Klikněte na předvolbu Datová schránka. Vznikne 24 znaků s velkými i malými písmeny, číslicemi a jen povolenými symboly, bez opakovaných znaků — vyhoví starším i novějším pravidlům ISDS.",
        ],
        [
          "Funguje FortiPass offline a jde nainstalovat?",
          "Ano. Po první návštěvě se aplikace uloží do zařízení a načte se i bez připojení. Většina prohlížečů ji nabídne nainstalovat — hledejte „Instalovat aplikaci“ nebo „Přidat na plochu“.",
        ],
        [
          "Odesílá kontrola síly to, co napíšu?",
          "Ne. Kontrola běží na pravidlech a výpočtech, které jsou součástí stránky — slovníková slova v češtině i angličtině, nejčastější hesla a jména, záměny písmen za číslice, opakování, řady z klávesnice a roky. Nic se neposílá po síti a pole se vymaže, jakmile stránku opustíte.",
        ],
      ],
    },

    passphrase: {
      title: "Generátor hesel ze slov – česká slova, bez diakritiky | FortiPass",
      description: `Vytvořte zapamatovatelné heslo z náhodných českých slov. Seznam ${csWords} slov, volitelně bez diakritiky, a přesný výpočet entropie. Běží jen ve vašem prohlížeči, zdarma a offline.`,
      h1: "Generátor hesel ze slov",
      lede: "Pár náhodných slov se píše i pamatuje snáz než změť znaků — a když je vybere počítač, uhodnout je stejně těžké.",
      body: `<section class="content">
          <h2>Proč česká slova</h2>
          <p>Většina generátorů skládá hesla ze slov jen z anglických seznamů. Česká slova si ale zapamatujete snáz a napíšete je bez chyby. FortiPass má vlastní seznam ${csWords} běžných českých slov — podstatných a přídavných jmen, sloves a příslovcí — vybraných tak, aby se dobře četla a nikoho neurazila.</p>
          <ul class="tips">
            <li><strong>Bez diakritiky:</strong> z <code>kůň-žlutý</code> se stane <code>kun-zluty</code>. Takové heslo projde každým formulářem i zahraniční klávesnicí. Seznam je sestavený tak, aby se žádná dvě slova bez diakritiky neshodovala, takže síla zůstává přesně stejná.</li>
            <li><strong>S diakritikou:</strong> čitelnější, ale některé systémy a klávesnice s ní mají potíže.</li>
            <li><strong>Angličtina:</strong> v menu Jazyk slov můžete přepnout na seznam EFF s ${enWords} anglickými slovy.</li>
          </ul>

          <h2>Kolik slov stačí</h2>
          <p>Každé slovo vybrané náhodně ze ${csWords} možností přidá log₂ ${csWords} ≈ ${bpw} bitu. Výpočet počítá s tím, že útočník seznam zná i ví, kolik slov jste použili.</p>
          ${c.passphraseTable("cs", 3, 10)}
          <p>Doby prolomení počítají s offline útokem se 100 miliardami pokusů za sekundu proti rychlému hashi, tedy s nejhorším případem. Web, který hesla ukládá správně (bcrypt, scrypt, Argon2), útočníka zpomalí o mnoho řádů.</p>

          <h2>Heslo ze slov, nebo náhodné znaky?</h2>
          <ul class="tips">
            <li><strong>Ze slov to, co píšete ručně:</strong> hlavní heslo správce hesel, přihlášení do počítače, šifrování disku, heslo k Wi-Fi, které diktujete návštěvě.</li>
            <li><strong><a href="${href("home")}">Náhodné znaky</a> pro všechno, co vyplní správce hesel:</strong> 16 a více náhodných znaků dá víc bitů na méně úhozů a stejně je nepíšete.</li>
            <li><strong>Slova nikdy nevybírejte sami.</strong> Lidé sahají po úryvcích písniček, citátech a slovech, která k sobě patří — a ta mají útočníci ve slovnících. Celé kouzlo je v náhodě.</li>
          </ul>
        </section>`,
      faq: [
        [
          "Kolik slov má heslo ze slov mít?",
          `Pět slov (asi ${f.format1(5 * f.bitsPerWord.cs)} bitu) stačí pro většinu účtů na webu s rozumně řešeným přihlášením. Pro všechno, co může útočník zkoušet offline — hlavní heslo správce hesel, šifrovaný disk nebo zálohu —, použijte šest a víc (${six} bitu a víc).`,
        ],
        [
          "Seznam slov je veřejný — není to slabina?",
          `Není. Entropie už počítá s tím, že útočník má přesně stejný seznam a zná počet slov. Bezpečnost je v náhodném výběru: šest slov ze ${csWords} dává zhruba ${f.sci(Math.pow(f.wordCounts.cs, 6))} stejně pravděpodobných kombinací.`,
        ],
        [
          "Je heslo bez diakritiky slabší?",
          "Není. Seznam je sestavený tak, aby po odstranění diakritiky nevznikla žádná dvě stejná slova, takže každé slovo přidá pořád stejný počet bitů. Diakritika by útočníkovi práci neztížila, jen by vám mohla zkomplikovat psaní.",
        ],
        [
          "Pomůže oddělovač, velká písmena nebo číslice?",
          `Trochu. Velké první písmeno u všech slov je jediné pravidlo (asi 1 bit), pevný oddělovač útočník vyzkouší taky a náhodná číslice přidá asi 3,3 bitu. Jedno slovo navíc (${bpw} bitu) pomůže mnohem víc — tyhle volby jsou hlavně pro weby, které číslici nebo symbol vyžadují.`,
        ],
        [
          "Co je Diceware?",
          `Metoda, při které se slova vybírají hodem kostkou ze seznamu 7 776 slov (6⁵, tedy pět hodů na slovo). FortiPass dělá totéž kryptografickým generátorem náhodných čísel místo kostek; anglický seznam je přímo seznam EFF pro Diceware.`,
        ],
        ["Posílají se hesla někam nebo ukládají?", privacyAnswer],
      ],
    },

    pin: {
      title: "Generátor PIN – náhodný 4, 6 nebo 8místný PIN | FortiPass",
      description:
        "Vygenerujte opravdu náhodný PIN o 3 až 16 číslicích pomocí kryptografické náhody prohlížeče — žádné datum narození ani 1234. Hromadné generování, zdarma, offline, nic se neodesílá.",
      h1: "Generátor náhodného PINu",
      lede: "Žádná data narození ani 1234 — každou číslici vybere kryptografický generátor náhodných čísel.",
      body: `<section class="content">
          <h2>Jak silný je PIN?</h2>
          <p>Každá číslice přidá log₂ 10 ≈ 3,3 bitu, takže i 8místný PIN má méně kombinací než heslo o šesti znacích. To nevadí: PIN nemá odolat offline útoku. Chrání kartu nebo zařízení, které se po pár špatných pokusech zablokuje, zamkne nebo smaže.</p>
          ${c.pinTable([4, 5, 6, 8, 10, 12])}
          <p>Poslední sloupec ukazuje dobu útoku hrubou silou bez jakéhokoli blokování, pro srovnání s hesly. Když se karta po třech špatných pokusech zablokuje, má zloděj u náhodného 4místného PINu šanci 3 ku 10 000.</p>

          <h2>PINy, kterým se vyhnout</h2>
          <p>Analýza 3,4 milionu uniklých čtyřmístných PINů od DataGenetics ukázala, že samotný 1234 tvořil zhruba desetinu z nich a dvacet nejčastějších PINů přes čtvrtinu. Útočníci je zkoušejí jako první:</p>
          <ul class="tips">
            <li><strong>Řady a opakování:</strong> 1234, 0000, 1111, 1212, 7777, 4321 a 2580 (svislý sloupec na klávesnici).</li>
            <li><strong>Data:</strong> roky jako 1985 nebo 2010 a narozeniny ve tvaru DDMM — dají se snadno dohledat na sociálních sítích.</li>
            <li><strong>Vaše jiná čísla:</strong> konec telefonního čísla, číslo popisné nebo starý PIN.</li>
          </ul>

          <h2>Jak vygenerovaný PIN použít</h2>
          <ul class="tips">
            <li>PIN ke kartě obvykle změníte v bankomatu nebo v bankovní aplikaci — tady ho vygenerujte, tam nastavte.</li>
            <li>U telefonu a všude, kde to jde, použijte 6 číslic.</li>
            <li>Nikdy ho nepište na kartu ani ho nenoste s ní; lepší místo jsou zabezpečené poznámky ve správci hesel.</li>
          </ul>
        </section>`,
      faq: [
        [
          "Je čtyřmístný PIN dost bezpečný?",
          "U platební karty, která se po třech špatných pokusech zablokuje, ano — pokud je náhodný. U telefonu raději 6 číslic nebo heslo: telefon je větší kořist a některé dovolí víc pokusů.",
        ],
        [
          "Proč náhodný PIN někdy vypadá jako vzor?",
          "Opravdu náhodné PINy obsahují všechny kombinace stejně často, včetně 1212 nebo 0007. Kdyby generátor „ošklivé“ PINy vyřazoval, byly by ostatní předvídatelnější. Pokud se vám některý zdá příliš zapamatovatelný, vygenerujte jiný.",
        ],
        [
          "Můžu vygenerovat víc PINů najednou?",
          "Ano. Nastavte „Kolik najednou“ až na 50 a pak je všechny zkopírujte nebo stáhněte jako textový soubor — hodí se na kódy ke dveřím, testovací data nebo jednorázové kódy.",
        ],
        ["Posílá se něco na server?", privacyAnswer],
      ],
    },

    checker: {
      title: "Kontrola síly hesla – jak bezpečné je moje heslo? | FortiPass",
      description:
        "Otestujte, jak silné je vaše heslo: entropie, odhad doby prolomení a konkrétní slabiny — česká i anglická slova, jména, záměny písmen, roky, řady z klávesnice. Běží lokálně, nic se neodesílá.",
      h1: "Kontrola síly hesla",
      lede: "Podívejte se na heslo očima programu na lámání hesel a zjistěte, jak dlouho by vydrželo. Nic, co napíšete, stránku neopustí.",
      body: `<section class="content">
          <h2>Jak kontrola funguje</h2>
          <p>Většina měřičů síly jen počítá délku a typy znaků. Heslo <code>Heslo123!</code> pak vyjde jako silné, přestože ho programy na lámání hesel uhodnou během pár sekund. FortiPass místo toho hledá nejlevnější způsob, jak heslo poskládat po kouscích — stejně jako pravidla, která používají útočníci:</p>
          <ul class="tips">
            <li><strong>Slova ze slovníku</strong> v češtině i angličtině — i slepená dohromady a bez diakritiky, takže <code>kocicka</code> je pořád „kočička“ — plus nejčastější hesla a česká jména a příjmení.</li>
            <li><strong>Předvídatelné záměny</strong> jako @ místo a, 0 místo o a 1 místo i nebo l.</li>
            <li><strong>Roky a data,</strong> opakované znaky, řady z klávesnice a abecedy (<code>qwertz</code>, <code>yxcvbnm</code>, <code>ěščř</code>, <code>4321</code>) a kopie dřívější části (<code>Ab3$Ab3$</code>).</li>
          </ul>
          <p>Každý kousek stojí tolik bitů, kolik by stálo ho uhodnout, a vyhrává nejlevnější rozklad. Výsledek uvidíte jako entropii v bitech a jako průměrnou dobu offline útoku při 100 miliardách pokusů za sekundu — se stejným předpokladem jako <a href="${href("crack")}">tabulka doby prolomení</a>.</p>

          <h2>Co kontrola vědět nemůže</h2>
          <p>Žádná kontrola nezná jméno vašeho psa, vaši ulici ani heslo, které jste používali v roce 2014. A hlavně nepozná, jestli heslo už neuniklo: uniklé heslo padne za nula sekund, ať je jakkoli dlouhé. To by vyžadovalo databázi úniků, kterou tahle stránka záměrně nikdy nekontaktuje. Na to použijte <a href="https://haveibeenpwned.com/Passwords" rel="noopener">Have I Been Pwned</a> a dobrý výsledek tady berte jako „žádná zjevná slabina“, ne jako záruku.</p>

          <h2>Jak ze slabého hesla udělat silné</h2>
          <ul class="tips">
            <li>Než ho začnete komplikovat, prodlužte ho — délka zvětšuje počet možností nejrychleji.</li>
            <li>Všechno, co jste vymysleli sami, nahraďte náhodou: <a href="${href("passphrase")}">heslem ze slov</a>, pokud ho píšete ručně, nebo <a href="${href("home")}">náhodným heslem</a>, pokud ho vyplňuje správce hesel.</li>
            <li>Používejte ho jen na jednom webu. Opakované použití je důvod, proč se z jednoho úniku stane deset.</li>
          </ul>
        </section>`,
      faq: [
        [
          "Je bezpečné sem psát svoje skutečné heslo?",
          "Kontrola běží celá ve vašem prohlížeči a bezpečnostní politika stránky blokuje všechny síťové požadavky, takže se nic odeslat nedá. Přesto je rozumné být opatrný u každého webu — když si nejste jistí, odpojte se nejdřív od internetu, nebo otestujte heslo se stejnou stavbou.",
        ],
        [
          "Proč moje heslo se symboly a číslicemi vychází slabě?",
          "Protože kontrola prohlédne obvyklé triky. Slovo ze slovníku s velkým písmenem, rokem a vykřičníkem je vzor, který programy na lámání hesel zkoušejí v prvních minutách. Heslo dělá silným délka a skutečná náhoda.",
        ],
        [
          "S čím počítá doba prolomení?",
          "S útočníkem, který ukradl databázi hashů hesel a zkouší 100 miliard možností za sekundu — to je reálné pro rychlé hashe jako MD5 nebo NTLM na sestavě s několika grafickými kartami. Jde o průměrnou dobu, tedy polovinu všech možností. Weby s bcrypt, scrypt nebo Argon2 útok výrazně zpomalí a přihlašovací formulář s omezením pokusů ještě víc.",
        ],
        [
          "Zjistí kontrola, jestli moje heslo neuniklo?",
          "Ne — to by znamenalo něco odeslat po síti, a to FortiPass nikdy nedělá. Have I Been Pwned nabízí kontrolu úniků, které se posílá jen prvních pět znaků hashe SHA-1 vašeho hesla.",
        ],
        [
          "Proč různé kontroly hesel ukazují různé výsledky?",
          "Počítají s různými útočníky (počet pokusů za sekundu, typ hashe) a s různými modely toho, jak lidé hesla tvoří; mnohé jen sčítají typy znaků. Porovnávejte zdůvodnění, ne jen číslo.",
        ],
      ],
    },

    wifi: {
      title: "Generátor hesla k Wi-Fi a QR kód pro hosty | FortiPass",
      description:
        "Vytvořte silné heslo k Wi-Fi (WPA2/WPA3) a QR kód, kterým se hosté připojí bez opisování. Hesla snadná na psaní i na televizi, kartička k vytisknutí, stažení SVG. Vše ve vašem prohlížeči.",
      h1: "Generátor hesla k Wi-Fi s QR kódem",
      lede: "Silné heslo pro vaši síť a QR kód, kterým se návštěvy připojí bez opisování.",
      body: `<section class="content">
          <h2>Jak změnit heslo k Wi-Fi</h2>
          <ol class="steps">
            <li>Otevřete administraci routeru — obvykle na adrese <code>192.168.0.1</code> nebo <code>192.168.1.1</code>, případně na adrese ze štítku na spodku routeru — a přihlaste se. Stejně dobře poslouží aplikace vašeho poskytovatele.</li>
            <li>Najděte nastavení bezdrátové sítě (WLAN) a zvolte <strong>WPA2-Personal</strong> nebo <strong>WPA3-Personal</strong>, případně smíšený režim WPA2/WPA3, pokud máte starší zařízení.</li>
            <li>Vložte heslo vygenerované výše a uložte. Všechna zařízení se odpojí; připojte je znovu novým heslem nebo naskenováním QR kódu.</li>
            <li>Když už jste tam, změňte i heslo do administrace routeru, pokud je pořád výchozí.</li>
          </ol>

          <h2>Jaký typ hesla zvolit</h2>
          <ul class="tips">
            <li><strong>20 písmen a číslic</strong> — asi ${f.format0(f.wifiBits.easy)} bitů, daleko mimo dosah hrubé síly, a bez podobných znaků, takže se dá napsat i ovladačem od televize.</li>
            <li><strong>5 náhodných slov</strong> — asi ${f.format0(f.wifiBits.words)} bitů a snadno se nadiktuje návštěvě. Na stránce v češtině jsou to česká slova bez diakritiky. Handshake WPA2 jde útočit offline, proto nechoďte pod pět slov.</li>
            <li><strong>32 znaků se symboly</strong> nebo <strong>63 znaků</strong> — pro sítě, kam nikdo heslo ručně nepíše: chytrá domácnost nebo kancelář, kde se všichni připojují QR kódem.</li>
          </ul>

          <h2>Je sdílení Wi-Fi přes QR kód bezpečné?</h2>
          <p>QR kód je jen název sítě a heslo ve standardním textovém tvaru (<code>WIFI:T:WPA;S:…;P:…;;</code>), kterému rozumí fotoaparáty telefonů. Kdo ho vyfotí, ten se připojí — s vytištěnou kartičkou proto zacházejte jako s heslem: na lednici ano, do okna ne. Pro návštěvy zvažte samostatnou síť pro hosty, která nevidí na vaše zařízení.</p>
        </section>`,
      faq: [
        [
          "Jak dlouhé má být heslo k Wi-Fi?",
          "WPA2 i WPA3 přijmou 8 až 63 znaků. Protože handshake WPA2 jde zachytit a lámat offline, použijte aspoň 16 náhodných znaků nebo 5 náhodných slov. WPA3 tomuto útoku odolá, ale většina sítí pořád pouští i zařízení s WPA2.",
        ],
        [
          "Funguje QR kód na iPhonu i Androidu?",
          "Ano. Wi-Fi QR kód rozpozná vestavěný fotoaparát na iPhonu (od iOS 11) i na většině telefonů s Androidem (od Androidu 10, případně přes Google Lens).",
        ],
        [
          "Můžu udělat QR kód pro heslo, které už mám?",
          "Ano. Napište název sítě a vygenerované heslo nahraďte svým. QR kód se mění průběžně, jak píšete.",
        ],
        [
          "Posílá se název sítě nebo heslo někam?",
          "Ne. Heslo i QR kód vznikají ve vašem prohlížeči a stránka nesmí odesílat žádné síťové požadavky. O vaší síti se nic neukládá — jen zvolený typ hesla a zabezpečení.",
        ],
        [
          "Proč heslo k Wi-Fi nemůže mít diakritiku?",
          "Norma WPA připouští jen tisknutelné znaky ASCII. Heslo s háčky a čárkami některé routery přijmou, ale část telefonů, televizí a tiskáren se pak nepřipojí. Proto generátor u slov diakritiku vždy vynechá.",
        ],
        [
          "WPA2, nebo WPA3?",
          "WPA3, pokud ho podporují všechna vaše zařízení, jinak smíšený režim WPA2/WPA3. Vyhněte se WEP a otevřeným sítím: WEP se dá prolomit za pár minut. QR kód funguje pro WPA2 i WPA3 stejně.",
        ],
      ],
    },

    crack: {
      title: "Jak dlouho trvá prolomit heslo? Tabulka 2026 | FortiPass",
      description:
        "Doba prolomení náhodných hesel o 4 až 20 znacích pro každou sadu znaků, plus hesla ze slov a PINy, při 100 miliardách pokusů za sekundu. Průhledný výpočet, volně k použití.",
      h1: "Jak dlouho trvá prolomit heslo?",
      lede: `Průměrná doba útoku hrubou silou na opravdu náhodná hesla, spočítaná z počtu všech možností. Aktualizováno: ${f.updated}.`,
      body: `<section class="content">
          <h2>Náhodná hesla</h2>
          ${c.crackTable({
            caption: "Průměrná doba útoku hrubou silou při 100 miliardách pokusů za sekundu",
            length: "Délka",
            symbolsCount: "znaků",
            pools: {
              digits: "Jen číslice",
              lower: "Malá písmena",
              letters: "Malá a velká písmena",
              alnum: "Písmena a číslice",
              all: "Písmena, číslice a symboly",
            },
          })}
          <p class="table-note">Barvy odpovídají hodnocení v generátoru: červená je velmi slabé, zelená výborné. Sloupec „Písmena, číslice a symboly“ počítá s 28 symboly, které FortiPass používá. Písmena jsou bez diakritiky.</p>

          <h2>Hesla ze slov</h2>
          <p>Každé slovo vybrané náhodně ze seznamu ${csWords} českých slov přidá ${bpw} bitu — asi jako dva náhodné znaky, ale zapamatuje se mnohem snáz. Vytvořte si ho v <a href="${href("passphrase")}">generátoru hesel ze slov</a>.</p>
          ${c.passphraseTable("cs", 3, 10)}

          <h2>Jak se čísla počítají</h2>
          <p>Náhodné heslo délky <var>L</var> ze sady <var>N</var> znaků má <var>N</var><sup><var>L</var></sup> možností, tedy <var>L</var> × log₂ <var>N</var> bitů. Útočník ho v průměru najde po vyzkoušení poloviny z nich. Tabulka to dělí číslem 10¹¹ — 100 miliard pokusů za sekundu, což je reálná rychlost sestavy s několika grafickými kartami proti rychlému nesolenému hashi jako MD5 nebo NTLM po úniku databáze.</p>
          <ul class="tips">
            <li><strong>Pomalé hashe pomáhají ohromně.</strong> Weby, které hesla ukládají pomocí bcrypt, scrypt nebo Argon2, srazí útočníka na tisíce až miliony pokusů za sekundu, takže každý čas v tabulce se znásobí sto tisíckrát i víc.</li>
            <li><strong>Útok přes přihlašovací formulář je ještě pomalejší.</strong> Omezení pokusů dovolí jen pár pokusů za minutu — ale nespoléhejte na to: databáze unikají.</li>
            <li><strong>Hardware je čím dál rychlejší.</strong> Nechte si rezervu. Náhodné heslo o 16 znacích jí má dost.</li>
          </ul>

          <h2>Proč vaše heslo může padnout mnohem dřív</h2>
          <p>Tabulka platí pro náhodná hesla. Hesla, která si lidé vymyslí — slovo, velké písmeno, rok, vykřičník —, se lámou slovníky a pravidly, ne hrubou silou, a padnou za pár sekund bez ohledu na délku. A heslo, které už uniklo, padne okamžitě, protože útočníci zkoušejí známá hesla jako první. Otestujte to svoje v <a href="${href("checker")}">kontrole síly hesla</a>, nebo ho nahraďte <a href="${href("home")}">náhodným</a>.</p>

          <h2>Použijte tabulku</h2>
          <p>Tabulku můžete volně převzít do článků, prezentací a školení — uveďte prosím jako zdroj <em>FortiPass</em> s odkazem na tuto stránku. Čísla generuje stejný <a href="https://github.com/robertlib/forti-pass" rel="noopener">otevřený kód</a>, který pohání generátor, takže vždy odpovídají tomu, co ukazuje aplikace.</p>
        </section>`,
      faq: [
        [
          "Jak dlouho trvá prolomit heslo o 8 znacích?",
          `Náhodné heslo o 8 znacích s velkými a malými písmeny, číslicemi a symboly vydrží při 100 miliardách pokusů za sekundu v průměru ${f.pw(8, 90)}. Jen z malých písmen: ${f.pw(8, 26)}. Heslo o 8 znacích, které si vymyslel člověk, obvykle padne slovníkovému útoku během sekund.`,
        ],
        [
          "Stačí heslo o 12 znacích?",
          `Náhodné heslo o 12 znacích se všemi čtyřmi typy znaků vydrží v průměru ${f.pw(12, 90)}, což dnes stačí. Jen z malých písmen: ${f.pw(12, 26)}. Pro důležité účty raději 16 znaků: ${f.pw(16, 90)}.`,
        ],
        [
          "Jak dlouho trvá prolomit heslo ze čtyř slov?",
          `Čtyři slova vybraná náhodně ze ${csWords} dají ${f.format1(4 * f.bitsPerWord.cs)} bitu — to je zhruba ${f.words(4, "cs")}. Šest slov: ${f.words(6, "cs")}.`,
        ],
        [
          "Proč jiné tabulky ukazují jiné časy?",
          "Zveřejněné tabulky se liší hlavně v tom, jaký hash a jaký hardware předpokládají. Rychlý hash na mnoha grafických kartách dává krátké časy jako tady, pomalý hash jako bcrypt mnohem delší. Tvar je ale ve všech tabulkách stejný: každý znak navíc vynásobí čas velikostí sady znaků.",
        ],
        [
          "Udělá symbol heslo výrazně silnějším?",
          `Méně než délka. U 12 znaků přidá přechod z písmen a číslic na všechny čtyři typy asi ${f.format1(12 * Math.log2(90) - 12 * Math.log2(62))} bitu; dvě písmena nebo číslice navíc přidají asi ${f.format1(2 * Math.log2(62))} bitu.`,
        ],
      ],
    },
  };
};
