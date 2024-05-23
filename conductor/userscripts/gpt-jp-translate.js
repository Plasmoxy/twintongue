// ==UserScript==
// @name         Plasmoxy GPT JP
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Translate textfield command frontend
// @author       You
// @match        https://web.whatsapp.com/*
// @icon         data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>👘</text></svg>
// @grant        none
// ==/UserScript==

// -------------API key ------

const AIS = '';

// --------------Stuff------------

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

// Get text from whatsapp message box in schizo way xddd
function getWhatsappMessageEl() {
    const lexicalrichtext = document.querySelectorAll(
        '.lexical-rich-text-input'
    )?.[1];
    return lexicalrichtext?.firstChild?.firstChild?.firstChild?.firstChild;
}

// ------ GPT setup ----

const PROMPT_TO_JP = (
    en
) => `Following the precise format of the provided example, please translate the provided English text into normal polite Japanese and then break down the produced Japanese text into parts, explaining each part. For parts which contain only a particle, do not explain anything. Provide only one line, as in the example!

Example:
EN: I thought that I wouldn't forget about it.
RESPONSE: \`私はそれを忘れないと思っていました | 私 (わたし, I) | は | それ (それ, that/it) | を | 忘れない (わすれない, will not forget) | と | 思っていました (おもっていました, thought)\`

Your task:
EN: ${en}
RESPONSE: \``;

const SEP_PROMPT = `\\\|`;
const PRIMARY_SEP = `\・\・\・`;
const SECONDARY_SEP = `\・`;

async function gpt(prompt) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AIS}`
    };
    const body = JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }]
    });

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: body
    });

    if (!response.ok) {
        return `Error: ${response.status} ${response.statusText}`;
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// --------------App------------

const moveCursorToEnd = (contentEle) => {
    const range = document.createRange();
    const selection = window.getSelection();
    range.setStart(contentEle, contentEle.childNodes.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
};

(function () {
    const state = {
        lastText: ''
    };

    async function analyze() {
        const current = getWhatsappMessageEl();
        if (!current) return;

        const currentText = current.textContent;

        // skip if the same text as previous loop
        if (state.lastText === currentText) return;
        state.lastText = currentText;

        console.log(currentText);

        // -- if already present, support ~ at the end to clear and use translation ---
        const matchPresent = /~([^\s]*) (.+?) ~ ([^・]+)(.*?)(\!?)~$/g.exec(
            currentText
        );
        if (matchPresent) {
            const fullText = matchPresent[0];
            const responseTranslation = matchPresent[3].trim();
            const cancelMark = matchPresent[5] === '/';

            console.log(
                `Detected end command with: ${responseTranslation}, finishing.`
            );

            if (cancelMark) {
                // allow canceling with !~
                current.textContent = currentText.replace(fullText, '');
            } else {
                // otherwise apply translation with ~
                current.textContent = currentText.replace(
                    fullText,
                    responseTranslation
                );
            }

            setTimeout(() => moveCursorToEnd(current.parentElement), 100);
            return;
        }

        // -- MAIN COMMAND ---
        const matchMain = /~([^\s]*) (.+?) ~ $/g.exec(currentText);
        if (matchMain) {
            const command = matchMain[1].trim();
            const content = matchMain[2].trim();

            console.log(`Matched main content: ${content}`);

            // translate
            console.log('Translating...');
            current.textContent = `${currentText} <TRANSLATING...>`;
            let response = await gpt(PROMPT_TO_JP(content));
            current.textContent = current.textContent.replace(
                ' <TRANSLATING...>',
                ''
            );

            // remove ` character
            response = response.replace(/\`/g, '');

            // use regex: swap occurence of prompt sep with primary, then next ones with secondary (g)
            response = response.replace(
                new RegExp(SEP_PROMPT, ''),
                PRIMARY_SEP
            );
            response = response.replace(
                new RegExp(SEP_PROMPT, 'g'),
                SECONDARY_SEP
            );

            console.log(response);

            // update text paragraph by adding the response and move cursor to end (need parent tho !)
            current.textContent = `${currentText} ${response}`;
            setTimeout(() => moveCursorToEnd(current.parentElement), 100);

            return;
        }
    }

    setInterval(analyze, 1000);
})();
