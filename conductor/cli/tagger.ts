// Tag cards related to SRT in a specific deck.

// TODO:
// same problems as in cli/to-anki.ts

import { JMdict } from '@scriptin/jmdict-simplified-types';
import { readFileSync } from 'fs';
import { addTag, findNotes } from '../app/anki';
import { AnalysedToken, analysis, initJmdict } from '../app/conductor';
import { EXCLUDED_TOKENS } from '../app/excluded-tokens';
import { containsNoJapanese } from '../app/jputilts';
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

function getLines(
    fileName: string,
    srtTimeRangeMs?: number[]
): SeparatedLine[] {
    // the subtitle file is the first argument

    // read the file
    const content = readFileSync(fileName, 'utf8');

    if (fileName.endsWith('.srt')) {
        const srt = fromSrt(content);
        const filtered = srt.filter((s) => {
            if (!srtTimeRangeMs) return true;
            return (
                s.timestamp >= srtTimeRangeMs[0] &&
                s.timestamp <= srtTimeRangeMs[1]
            );
        });
        return filtered.map((s) => separate(s.lines));
    } else {
        // text files are split by lines
        return content.split('\n').map((l) => separate([l]));
    }
}

async function taggerKanji(
    fileName: string,
    deckName: string,
    kanjiField: string,
    tagName: string
) {
    const lineEntries = getLines(fileName);
    console.log(`Got ${lineEntries.length} lines`);

    const kanjiSet = new Set<string>();

    const maches = lineEntries
        .map((l) => l.jp)
        .join('')
        .match(/[\p{Script=Han}]/gmu);
    if (!maches) throw new Error('No kanji found in the file.');

    for (const kanji of maches) {
        kanjiSet.add(kanji);
    }

    console.log(`Found ${kanjiSet.size} unique kanji.`);

    console.log(`Now tagging cards in deck ${deckName}...`);

    const taggedKanji = new Set<string>();
    for (const kanji of kanjiSet) {
        const query = `"deck:${deckName}" "${kanjiField}:${kanji}"`;
        const res = await findNotes(query);
        const noteIds: number[] = res.data.result || [];
        if (!noteIds?.length) continue;

        const tagRes = await addTag(noteIds, tagName);
        if (tagRes.data.error === null) taggedKanji.add(kanji);
        console.dir(res.data, { depth: null });
    }

    console.log(`Tagged ${taggedKanji.size} kanjis in deck ${deckName}.\n\n`);
}

async function tagger(
    fileName: string,
    vocabDeck: string,
    vocabDeckLookupFields: string[],
    tagName: string
) {
    const lineEntries = getLines(fileName);
    console.log(`Got ${lineEntries.length} lines`);

    // vocabulary map
    const vocabMap = new Map<string, AnalysedToken>();

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
                ) && t.pos !== 'symbol';

            // skip if not significant
            if (!isSignificant) continue;

            // phrase
            for (const phrase of t.phrasesDirect) {
                if (phrase.length >= 3 && !vocabMap.has(phrase.text)) {
                    vocabMap.set(phrase.text, t);
                }
            }

            // this token vocab
            const tokenJp = t.base || t.surface; // base form primarily (kanji / kana)
            if (!tokenJp) continue;
            vocabMap.set(tokenJp, t);
        }
    }

    console.log(`Analyzed ${vocabMap.size} unique vocab entries from tokens.`);

    console.log(
        `Now tagging vocabulary cards in deck ${vocabDeck} with tag ${tagName}...`
    );

    // const taggedWords = new Set<string>();
    // for (const [word, token] of vocabMap) {
    //     const query =
    //         `"deck:${vocabDeck}" (` +
    //         vocabDeckLookupFields.map((f) => `"${f}:${word}"`).join(' OR ') +
    //         ')';
    //     const res = await findNotes(query);
    //     console.log(query);

    //     const noteIds: number[] = res.data.result || [];

    //     if (!noteIds?.length) continue;
    //     const tagRes = await addTag(noteIds, tagName);

    //     if (tagRes.data.error === null) taggedWords.add(word);
    //     console.dir(res.data, { depth: null });
    // }

    // console.log(`Tagged ${taggedWords.size} words in deck ${vocabDeck}.\n\n`);
}

async function main() {
    const fileName = process.argv[2];
    let tagName = process.argv[3];
    if (!fileName) throw new Error('No file name provided.');
    if (!tagName) throw new Error('No tag name provided.');
    tagName = `C-${tagName}`;

    console.log(`Tagging words from ${fileName} file.`);

    // init dict
    const dict: JMdict = JSON.parse(
        readFileSync('public/jmdict-eng-3.5.0.json', 'utf8')
    );
    await initJmdict(dict);

    // tags

    // await tagger(fileName, 'WU3-tokyo', ['Characters', 'Reading'], tagName);
    // await tagger(fileName, 'Refold JP1K v2', ['Word'], tagName);
    // await tagger(fileName, 'Core2.3k Version 3', ['Word', 'Reading'], tagName);

    await taggerKanji(fileName, 'WU3-tokyo-Kanji', 'Characters', tagName);
}

main().catch((e) => console.error(e));
