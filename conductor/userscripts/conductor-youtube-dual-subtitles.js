// ==UserScript==
// @name         Plasmoxy Conductor DUAL
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  conductor userscript for youtube subtitles (also asbplayer)
// @author       You
// @match        https://www.youtube.com/*
// @match        https://killergerbah.github.io/*
// @icon         data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌸</text></svg>
// @grant        none
// ==/UserScript==

function addGlobalStyle(css) {
    var head, style;
    head = document.getElementsByTagName('head')[0];
    if (!head) {
        return;
    }
    style = document.createElement('style');
    style.innerHTML = css;
    head.appendChild(style);
}

(function () {
    const host =
        window.location.hostname === 'www.youtube.com' ? 'youtube' : 'asb';

    console.log(`Running conductor userscript 🌸 with host ${host}`);

    // Custom global styles for hiding and fixing subtitles.
    if (host === 'youtube')
        addGlobalStyle(`.ytp-caption-segment { display: none !important; }`);

    if (host === 'asb')
        addGlobalStyle(
            `.jss5 > div > div > span { display: none !important; }`
        );

    const huePallete = [
        '#1eabe3', // blue
        '#ccfbf1', // whitey cyan
        '#ff96e0', // pink
        '#ebccff', // purple
        '#ffbdbd', // rose
        '#a8ffad', // green
        '#f4ffba' // yellow
    ];
    let palleteCounter = 0;

    const EXCLUDED_TOKENS = [
        { text: 'する', pos: 'verb' },
        { text: 'い', pos: 'verb' },
        { text: 'ます', pos: 'noun' },
        { text: 'ちゃっ', pos: 'verb' }
    ];

    // Japanese utils ...

    function containsKanji(input) {
        // Regular expression for kanji characters
        const kanjiRegex = /[\u4E00-\u9FFF]/;

        // Check if the input string contains any kanji characters
        return kanjiRegex.test(input);
    }

    // TODO: maybe rework to {Script} /u matcher
    function isHiraganaOnly(input) {
        // Regular expression for hiragana characters
        const hiraganaRegex = /^[\u3040-\u309F]+$/;

        // Check if the input string contains only hiragana characters
        return hiraganaRegex.test(input);
    }

    function containsNoJapanese(text) {
        const regex =
            /^[^\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]*$/u;
        return regex.test(text);
    }

    // State and logic ...

    const state = {
        previousJp: 'INIT',
        translationVisible: true,
        useMaruFont: false,
        fontSize: 28,
        furigana: true
    };

    function retrieveElements() {
        if (host === 'youtube') {
            const subtitlesElements = [
                ...document.querySelectorAll(
                    '.caption-visual-line > .ytp-caption-segment'
                )
            ];

            if (subtitlesElements.length !== 2) return;

            const [jpElement, enElement] = subtitlesElements;
            const subtitlesParent = jpElement.parentElement;
            state.currentRoot = jpElement;

            const [jp, en] = subtitlesElements.map((t) => t.textContent);
            return { jp, en, jpElement, subtitlesParent };
        }

        if (host === 'asb') {
            const asbSubtitleElements = [
                ...document.querySelectorAll(`.jss5 > div > div > span`)
            ];
            if (!asbSubtitleElements || asbSubtitleElements.length === 0)
                return;
            const asbParent = asbSubtitleElements[0].parentElement;

            // get text content and split into lines
            let textContent = asbSubtitleElements
                .map((e) => e.textContent)
                .join('\n');

            // basic filtering, remove texts in brackets () and []
            textContent = textContent.replace(/\(.*?\)/g, '');
            textContent = textContent.replace(/\[.*?\]/g, '');
            textContent = textContent.replace(/（.*?）/gu, ''); // remove text in japanese unicode brackets

            const lines = textContent.split('\n').map((l) => l.trim());

            // if user is using merged dual subtitles, there will be lines of japanese and then lines of english
            // -> so we filter them and rejoin
            const jp = lines.filter((l) => !containsNoJapanese(l)).join(' ');
            const en = lines.filter((l) => containsNoJapanese(l)).join(' ');

            return {
                jp,
                en,
                asbParent,
                asbSubtitleElements
            };
        }
    }

    async function analyze() {
        // get elements
        const elements = retrieveElements();
        if (!elements) return;
        const { jp, en } = elements;

        // check if changed
        if (jp === state.previousJp) return;
        state.previousJp = jp;

        console.log({ jp, en });

        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jp, en })
        };

        const results = await fetch(`http://localhost:10942/analyze`, options)
            .then((r) => r.json())
            .catch((e) => console.log(e));

        console.log(results);

        // split en by words for colorization
        let coloredEn = en.trim().split(/\s+|[,;.!?\s"]+/);

        // count phrase tokens that need to be colored
        let remainingPhraseTokens = 0;
        let lastPhraseColor = undefined;

        const bgColor = `rgba(0, 0, 0, 1)`;

        const Token = (t) => {
            const isColored =
                !EXCLUDED_TOKENS.some(
                    (ex) =>
                        (ex.text === t.text || ex.text === t.base) &&
                        ex.pos === t.pos
                ) &&
                t.pos !== 'symbol' &&
                (!isHiraganaOnly(t.text) || t.text.length >= 3);

            let color = isColored
                ? huePallete[palleteCounter++ % huePallete.length]
                : '#ffffff';

            // furigana (ruby top) part
            const rtpart =
                isColored && state.furigana
                    ? `<rt style="color: #eee;">${t.reading}</rt>`
                    : ``;

            // additionally colorize also en by looking up the english text by t.eng
            for (let word of t.eng.split(' ')) {
                word = word.replace(/(ing|ed|s)$/, ''); // remove verb inflection endings from word using regex
                word = word.replace(/'s$/, ''); // remove apostrophe endings

                // go through all colorization candidates and colorize if not colorized before and matches the head of the word
                for (const [i, candidate] of coloredEn.entries()) {
                    if (
                        word.length > 1 &&
                        !candidate.startsWith('<') &&
                        candidate.toLowerCase().startsWith(word.toLowerCase())
                    ) {
                        coloredEn[
                            i
                        ] = `<span style="color: ${color};">${candidate}</span>`;
                    }
                }
            }

            const isPhraseStart =
                remainingPhraseTokens === 0 &&
                t.phrasesDirect?.[0] &&
                (isColored || t.phrasesDirect?.[0].length >= 3);

            // phrase token counter
            if (isPhraseStart) {
                remainingPhraseTokens = t.phrasesDirect?.[0].length + 1; // add 1 for the current token

                // if this is a new phrase and the token is not colored, we pick a new color specifically for this phrase
                if (!isColored) {
                    color = huePallete[palleteCounter++ % huePallete.length];
                }

                // setup phrase color
                lastPhraseColor = color;
            }

            if (remainingPhraseTokens > 0) remainingPhraseTokens--;

            // if this token is within a phrase, it is highlighted
            const isPhrase = remainingPhraseTokens > 0;
            const phraseHighlight = isPhrase
                ? `border-bottom: solid 3px ${lastPhraseColor};`
                : '';

            return `<div style="background-color: ${bgColor}; border-radius: 8px; padding: 2px; display: inline-flex; flex-direction: column; position: relative;">
            
                    <!-- japanese token text + ruby top part (furigana) -->
                    <ruby style="color: ${color}; ${phraseHighlight}">${
                t.text
            }${rtpart}</ruby>
            
                    <!-- direct translation (best = colored) -->
                    ${
                        isColored && state.translationVisible
                            ? `<span style="font-size: ${
                                  state.fontSize - 10
                              }px; color: ${
                                  isPhrase ? '#aaa' : color
                              }; margin-left: 3px; margin-right: 3px;">${
                                  t.eng
                              }</span>`
                            : ``
                    }
                    
                    <!-- direct translations (other) -->
                    ${
                        isColored && state.translationVisible
                            ? t.direct
                                  .filter((text) => text !== t.eng)
                                  .map(
                                      (e) =>
                                          `<span style="font-size: ${
                                              state.fontSize - 13
                                          }px; color: #aaa; margin-left: 3px; margin-right: 3px;">${e}</span>`
                                  )
                                  .join('')
                            : ``
                    }
                    
                    <!-- phrase translation -->
                    ${
                        isPhraseStart && state.translationVisible
                            ? `<div style="display: flex; position: absolute; top: 100%; margin-top: 5px; font-size: ${
                                  state.fontSize - 12
                              }px; padding-left: 3px; color: ${color}; background-color: ${bgColor}; border-radius: 8px;">
                                <span style="white-space: nowrap;">${
                                    t.phrasesDirect?.[0].texts?.[0]
                                }</span>
                            </div>`
                            : ``
                    }
                </div>`;
        };

        function render() {
            const root = document.createElement('div');

            root.innerHTML = `<div style="padding: 10px; margin-top: 15px; margin-bottom: 15px; font-size: ${
                state.fontSize
            }px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; ${
                state.useMaruFont ? "font-family: 'Zen Maru Gothic';" : ''
            }">
                    <!-- jp -->
                    <div style="cursor: text !important; user-select: text !important; ${
                        state.translationVisible
                            ? ''
                            : 'background-color: ' +
                              bgColor +
                              '; padding: 3px; border-radius: 8px;'
                    }">${results.map((tok) => Token(tok)).join('')}</div>
                    
                    <!-- en -->
                    <div style="cursor: text !important; user-select: text !important; padding: 3px; margin-top: 24px; font-size: ${
                        state.fontSize - 6
                    }px; background-color: ${bgColor}; border-radius: 8px;">${
                state.translationVisible ? coloredEn.join(' ') : ''
            }</div>
                    
                    <!-- conductor controls -->
                    <div style="margin-top: 16px; font-size: 16px; margin-left: auto; margin-right: auto; display: flex;">
                    
                        <div id="fontplusbtn" style="padding: 3px; cursor: pointer !important; display: flex; flex: 0;">
                            <span>＋</span>
                        </div>
                        
                        <div id="fontminusbtn" style="padding: 3px; cursor: pointer !important; display: flex; flex: 0;">
                            <span>ー</span>
                        </div>
                    
                        <!-- maru button -->
                        <div id="marubtn" style="padding: 3px; cursor: pointer !important; display: flex; flex: 0; ${
                            state.useMaruFont ? 'color: #909090;' : ''
                        }">
                            <span>マ</span>
                        </div>
                        
                        <!-- furigana button -->
                        <div id="furiganabtn" style="padding: 3px; cursor: pointer !important; display: flex; flex: 0; ${
                            !state.furigana ? 'color: #909090;' : ''
                        }">
                            <span>あ</span>
                        </div>
                    
                        <!-- translate button -->
                        <div id="translbtn" style="padding: 3px; cursor: pointer !important; display: flex; flex: 0;">
                            <svg style="margin: 6px; color: red;" width="16px" height="16px" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${
                                state.translationVisible ? '#ffffff' : '#909090'
                            }" class="bi bi-translate">
                                <path d="M4.545 6.714 4.11 8H3l1.862-5h1.284L8 8H6.833l-.435-1.286H4.545zm1.634-.736L5.5 3.956h-.049l-.679 2.022H6.18z"/>
                                <path d="M0 2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v3h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3H2a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm7.138 9.995c.193.301.402.583.63.846-.748.575-1.673 1.001-2.768 1.292.178.217.451.635.555.867 1.125-.359 2.08-.844 2.886-1.494.777.665 1.739 1.165 2.93 1.472.133-.254.414-.673.629-.89-1.125-.253-2.057-.694-2.82-1.284.681-.747 1.222-1.651 1.621-2.757H14V8h-3v1.047h.765c-.318.844-.74 1.546-1.272 2.13a6.066 6.066 0 0 1-.415-.492 1.988 1.988 0 0 1-.94.31z"/>
                            </svg>
                        </div>
                       
                    </div>
                </div>`;

            // Element replacement logic
            if (host === 'youtube') {
                const { subtitlesParent } = elements;
                subtitlesParent.replaceChild(root, state.currentRoot);
                state.currentRoot = root;
            }

            // in case of asb, the subtitle container gets cleared every time
            // so we just hide the asb subtitle span and add our own div
            if (host === 'asb') {
                const { asbParent, asbSubtitleElements } = elements;
                asbSubtitleElements.forEach((e) => (e.style.display = 'none'));

                // remove all div elemeents from asb parent
                asbParent.querySelectorAll('div').forEach((e) => e.remove());

                // add our own div
                asbParent.appendChild(root);
            }

            // buttons

            root.querySelector('#translbtn').addEventListener('click', () => {
                state.translationVisible = !state.translationVisible;
                render();
            });

            root.querySelector('#marubtn').addEventListener('click', () => {
                state.useMaruFont = !state.useMaruFont;
                render();
            });

            root.querySelector('#furiganabtn').addEventListener('click', () => {
                state.furigana = !state.furigana;
                render();
            });

            root.querySelector('#fontplusbtn').addEventListener('click', () => {
                state.fontSize += 2;
                render();
            });

            root.querySelector('#fontminusbtn').addEventListener(
                'click',
                () => {
                    state.fontSize -= 2;
                    render();
                }
            );
        }

        render();
    }

    setInterval(analyze, 100);
})();
