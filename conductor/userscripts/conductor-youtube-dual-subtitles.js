// ==UserScript==
// @name         Plasmoxy Conductor DUAL
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  conductor userscript for youtube subtitles
// @author       You
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
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
    'use strict';

    console.log('Running conductor userscript 🌸');

    addGlobalStyle(`.ytp-caption-segment { display: none !important; }`);

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

    const importantPos = [
        'noun',
        'adjectival noun',
        'adjective',
        'adverb',
        'verb'
    ];

    function containsKanji(input) {
        // Regular expression for kanji characters
        const kanjiRegex = /[\u4E00-\u9FFF]/;

        // Check if the input string contains any kanji characters
        return kanjiRegex.test(input);
    }

    function isHiraganaOnly(input) {
        // Regular expression for hiragana characters
        const hiraganaRegex = /^[\u3040-\u309F]+$/;

        // Check if the input string contains only hiragana characters
        return hiraganaRegex.test(input);
    }

    const state = {
        previousJp: 'INIT',
        translationVisible: true
    };

    async function analyze() {
        const subtitlesElements = [
            ...document.querySelectorAll(
                '.caption-visual-line > .ytp-caption-segment'
            )
        ];

        if (subtitlesElements.length !== 2) return;

        const [jpElement, enElement] = subtitlesElements;
        const subtitlesParent = jpElement.parentElement;

        const [jp, en] = subtitlesElements.map((t) => t.textContent);

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

        const Token = (t) => {
            const isColored = !isHiraganaOnly(t.text) || t.text.length >= 3;

            const color = isColored
                ? huePallete[palleteCounter++ % huePallete.length]
                : '#ffffff';
            const rtpart = isColored
                ? `<rt style="color: ${color};">${t.reading}</rt>`
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

            return `<div style="display: inline-flex; flex-direction: column;">
                    <ruby style="color: white;">${t.text}${rtpart}</ruby>
                    ${
                        isColored
                            ? `<span style="font-size: 14px; color: ${color}; margin-left: 3px; margin-right: 3px;">${t.eng}</span>`
                            : ``
                    }
                    ${
                        isColored
                            ? t.direct
                                  .filter((text) => text !== t.eng)
                                  .map(
                                      (e) =>
                                          `<span style="font-size: 11px; color: #aaa; margin-left: 3px; margin-right: 3px;">${e}</span>`
                                  )
                                  .join('')
                            : ``
                    }
                </div>`;
        };

        function render() {
            const root = document.createElement('div');

            root.innerHTML = `<div style="background-color: black; padding: 10px; margin-top: 15px; margin-bottom: 15px; font-size: 24px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                    <!-- jp -->
                    <div style="cursor: text !important; user-select: text !important;">${results
                        .map((tok) =>
                            state.translationVisible ? Token(tok) : tok.text
                        )
                        .join('')}</div>
                    
                    <!-- en -->
                    <div style="cursor: text !important; user-select: text !important; margin-top: 16px; font-size: 16px;">${coloredEn.join(
                        ' '
                    )}</div>
                    
                    <!-- conductor controls -->
                    <div  style="margin-top: 16px; font-size: 16px; margin-left: auto;">
                    
                        <!-- translate button -->
                        <div id="translbtn" style="margin: 3px; padding: 3px; cursor: pointer !important;">
                            <svg style="margin: 6px; color: red;" width="800px" height="800px" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${
                                state.translationVisible ? '#ffffff' : '#909090'
                            }" class="bi bi-translate">
                                <path d="M4.545 6.714 4.11 8H3l1.862-5h1.284L8 8H6.833l-.435-1.286H4.545zm1.634-.736L5.5 3.956h-.049l-.679 2.022H6.18z"/>
                                <path d="M0 2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v3h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3H2a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm7.138 9.995c.193.301.402.583.63.846-.748.575-1.673 1.001-2.768 1.292.178.217.451.635.555.867 1.125-.359 2.08-.844 2.886-1.494.777.665 1.739 1.165 2.93 1.472.133-.254.414-.673.629-.89-1.125-.253-2.057-.694-2.82-1.284.681-.747 1.222-1.651 1.621-2.757H14V8h-3v1.047h.765c-.318.844-.74 1.546-1.272 2.13a6.066 6.066 0 0 1-.415-.492 1.988 1.988 0 0 1-.94.31z"/>
                            </svg>
                        </div>
                    </div>
                </div>`;

            // remove all children and add tx
            subtitlesParent.innerHTML = '';
            subtitlesParent.appendChild(root);

            // add event listener to translate button
            root.querySelector('#translbtn').addEventListener('click', () => {
                console.log('transl');
                state.translationVisible = !state.translationVisible;
                render();
            });
        }

        render();
    }

    setInterval(analyze, 100);
})();
