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

    const EXCLUDED_TOKENS = [
        { text: 'する', pos: 'verb' },
        { text: 'い', pos: 'verb' },
        { text: 'し', pos: 'verb' }
    ];

    let previousJp = 'INIT';

    async function analyze() {
        const subtitlesElements = [
            ...document.querySelectorAll(
                '.caption-visual-line > .ytp-caption-segment'
            )
        ];

        if (subtitlesElements.length !== 2) return;
        const [jpElement, enElement] = subtitlesElements;
        const [jp, en] = subtitlesElements.map((t) => t.textContent);

        if (jp === previousJp) return;
        previousJp = jp;

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
            const isColored =
                importantPos.includes(t.pos) &&
                !EXCLUDED_TOKENS.some(
                    (ex) => ex.text === t.text && ex.pos === t.pos
                );

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
                <ruby style="color: ${color};">${t.text}${rtpart}</ruby>
                ${
                    isColored
                        ? `<span style="font-size: 14px; color: ${color}; margin-left: 3px; margin-right: 3px;">${t.eng}</span>`
                        : ``
                }
            </div>`;
        };

        const tx = document.createElement('div');
        tx.innerHTML = `<div style="user-select: text; background-color: black; padding: 10px; margin-top: 15px; margin-bottom: 15px; font-size: 24px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div>${results.map((tok) => Token(tok)).join('')}</div>
            <div style="margin-top: 16px; font-size: 16px;">${coloredEn.join(
                ' '
            )}</div>
        </div>`;

        jpElement.parentElement.replaceChild(tx, jpElement);
    }

    setInterval(analyze, 100);
})();
