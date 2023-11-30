// require single SRT file that contains both japanese and english subtitles
// get subtitles directly from file using ffmpeg
// and/or get them from https://kitsunekko.net/  (jp subtitles)
// - eng+jp can be merged using https://subtitletools.com/merge-subtitles-online

// TODO:
// [ ] support phrases
// [ ] assign reading from base form and not from surface form (retrieve base reading from jmdict directly)

import { JMdict } from '@scriptin/jmdict-simplified-types';
import { readFileSync } from 'fs';
import path from 'path';
import { toHiragana } from 'wanakana';
import { AnkiCardData, createAnkiDeck, sendDeckToAnki } from '../app/anki';
import { analysis, initJmdict } from '../app/conductor';
import { EXCLUDED_TOKENS } from '../app/excluded-tokens';
import { containsNoJapanese, isHiraganaOnly } from '../app/jputilts';
import { fromSrt } from '../app/srt-tools';

type SeparatedLine = {
    jp: string;
    en: string;
};

// separate input lines into jp and en by whether japanese characters are present
function separate(lines: string[]): SeparatedLine {
    return {
        jp: lines.filter((l) => !containsNoJapanese(l)).join(' '),
        en: lines.filter((l) => containsNoJapanese(l)).join(' ')
    };
}

function getLines(fileName: string): SeparatedLine[] {
    // the subtitle file is the first argument

    // read the file
    const content = readFileSync(fileName, 'utf8');

    if (fileName.endsWith('.srt')) {
        return fromSrt(content).map((s) => separate(s.lines));
    } else {
        // text files are split by lines
        return content.split('\n').map((l) => separate([l]));
    }
}

async function main() {
    const fileName = process.argv[2];

    // init dict
    const dict: JMdict = JSON.parse(
        readFileSync('public/jmdict-eng-3.5.0.json', 'utf8')
    );
    await initJmdict(dict);

    const lineEntries = getLines(fileName);

    // anki cards map
    const cardMap = new Map<string, AnkiCardData>();

    // now do analysis
    for (const line of lineEntries) {
        const tokens = await analysis(line.jp, line.en);

        // map through tokens
        for (const t of tokens) {
            // such token would be colored on the conductor FE
            const isSignificant =
                !EXCLUDED_TOKENS.some(
                    (ex) =>
                        (ex.text === t.text || ex.text === t.base) &&
                        ex.pos === t.pos
                ) &&
                t.pos !== 'symbol' &&
                (!isHiraganaOnly(t.text) || t.text.length >= 3);

            // skip if not significant
            if (!isSignificant) continue;

            let backText = '';

            const frontText = `<ruby style="color: white; font-family: 'Noto Sans JP'; font-size: 36px;">${
                t.text
            }<rt style="color: #ff96e0;">${toHiragana(
                t.token.reading || ''
            )}</rt></ruby>`;

            if (isSignificant) {
                backText +=
                    t.alignedGloss
                        .slice(0, 4)
                        .map((g) => g.gloss.text)
                        .join('<br/>') + `<hr>`;
            }

            if (!cardMap.has(t.surface)) {
                cardMap.set(t.surface, {
                    Front: frontText,
                    Back: backText
                });
            }

            // BONUS: resolve phrases with length >= 3
            // for (const phrase of t.phrasesDirect) {
            //     if (phrase.length >= 3 && !cardMap.has(phrase.text)) {
            //         cardMap.set(phrase.text, {
            //             Front: ,
            //             Back: backText + phrase.gloss.text
            //         });
            //     }
            // }
        }
    }

    console.log(`Generated ${cardMap.size} cards`);

    // generate deck
    const cards = Array.from(cardMap.values());

    // shuffle
    function shuffleArray(array: any[]) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // shuffleArray(cards);

    // deck
    const deckName: string = `Conductor::${path.basename(fileName)}`;
    console.log(`Creating deck '${deckName}' ...`);
    await createAnkiDeck(deckName);

    // send notes
    console.log(`Sending notes to '${deckName}' ...`);
    await sendDeckToAnki(deckName, cards);

    console.log(`Done!`);
}

main().catch((e) => console.error(e));
