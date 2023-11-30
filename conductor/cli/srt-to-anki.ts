// require single SRT file that contains both japanese and english subtitles
// it can be merged using https://subtitletools.com/merge-subtitles-online

import { JMdict } from '@scriptin/jmdict-simplified-types';
import { readFileSync } from 'fs';
import path from 'path';
import { toHiragana } from 'wanakana';
import { AnkiCardData, createAnkiDeck, sendDeckToAnki } from '../app/anki';
import { analysis, initJmdict } from '../app/conductor';
import { isHiraganaOnly } from '../app/jputilts';
import { fromSrt } from '../app/srt-tools';

async function main() {
    // the subtitle file is the first argument
    const file = process.argv[2];

    // read the file
    const content = readFileSync(file, 'utf8');
    const entries = fromSrt(content);

    // init dict
    const dict: JMdict = JSON.parse(
        readFileSync('public/jmdict-eng-3.5.0.json', 'utf8')
    );
    await initJmdict(dict);

    // anki cards map
    const cardMap = new Map<string, AnkiCardData>();

    // now do analysis
    for (const entry of entries) {
        const jp = entry.lines.join(' ');

        // TODO: eng mapping
        const tokens = await analysis(jp, '');

        // map through tokens
        for (const t of tokens) {
            // such token would be colored on the conductor FE
            const isSignificant =
                t.pos !== 'symbol' &&
                (!isHiraganaOnly(t.text) || t.text.length >= 3);

            const isPhraseStart =
                t.phrasesDirect?.[0] &&
                (isSignificant || t.phrasesDirect?.[0].length >= 3);

            // skip if not significant and not a phrase
            if (!isSignificant && !isPhraseStart) continue;

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

            if (isPhraseStart) {
                backText += t.phrasesDirect
                    .slice(0, 4)
                    .map((p) => p.texts.join('<br/>'))
                    .join('<br/>');
            }

            if (!cardMap.has(t.surface)) {
                cardMap.set(t.surface, {
                    Front: frontText,
                    Back: backText
                });
            }
        }
    }

    console.log(`Generated ${cardMap.size} cards`);

    // generate deck
    const cards = Array.from(cardMap.values());

    // shuffle
    function shuffleArray(array: any[]) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            // Swap array[i] and array[j]
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
    shuffleArray(cards);

    // deck
    const deckName: string = `Conductor::${path.basename(file)}`;
    console.log(`Creating deck '${deckName}' ...`);
    await createAnkiDeck(deckName);

    // send notes
    console.log(`Sending notes to '${deckName}' ...`);
    await sendDeckToAnki(deckName, cards);

    console.log(`Done!`);
}

main().catch((e) => console.error(e));
