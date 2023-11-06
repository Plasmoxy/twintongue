import {
    JMdict,
    JMdictSense,
    JMdictWord
} from '@scriptin/jmdict-simplified-types';
import Table from 'cli-table3';
import 'colors';
import { readFileSync, writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import { KuromojiToken, tokenize } from 'kuromojin';
import { toHiragana } from 'wanakana';
import { hueColorizeSrt } from './hue-colors';
import { KuromojiPos, kuromojiPartOfSpeech } from './kuromoji-lexical';
import { SrtEntry, fromSrt, toSrt } from './srt-tools';

const samplejap = `深海の山雰囲気なのでちっちゃい布が群れをなして泳いでるように見えますね魚のように`;
const samplereference = `It looks like a mountain in the deep sea, so it looks like small pieces of cloth are swimming in groups, like fish.`;

const inspect = (obj: any) => console.dir(obj, { depth: null });

console.log('Loading jmdict');
const jmdict: JMdict = JSON.parse(
    readFileSync('jmdict-eng-3.5.0.json', 'utf8')
);
console.log(`Loaded jmict with ${jmdict.words.length} words`);

// map from kanji to word
const fromKanjiMap = new Map<string, JMdictWord[]>();
const fromKanaMap = new Map<string, JMdictWord[]>();
for (const word of jmdict.words) {
    // common kanji
    for (const kanji of word.kanji) {
        if (kanji.common) {
            fromKanjiMap.set(kanji.text, [
                ...(fromKanjiMap.get(kanji.text) || []),
                word
            ]);
        }
    }
    // all kana
    for (const kana of word.kana) {
        fromKanaMap.set(kana.text, [
            ...(fromKanaMap.get(kana.text) || []),
            word
        ]);
    }
    // uncommon kanji
    for (const kanji of word.kanji) {
        if (!kanji.common) {
            fromKanjiMap.set(kanji.text, [
                ...(fromKanjiMap.get(kanji.text) || []),
                word
            ]);
        }
    }
}

export type Candidate = {
    text: string;
    type: 'kanji' | 'kana';
    length: number;
    word: JMdictWord;
};

// async function jmdictScan(sentence: string) {
//     // Mapped levels
//     const analysedWords = [];

//     // Initize first fragment
//     const maxFragmentLength = 20;

//     // Fragment <start, end>
//     let fragStart: number;
//     let fragEnd: number;
//     const initFrag = (start: number) => {
//         fragStart = start;
//         fragEnd = Math.min(start + maxFragmentLength - 1, sentence.length - 1);
//     };
//     initFrag(0);

//     // Scan through fragments until start of fragment is at the end of sentence
//     while (fragStart < sentence.length) {
//         console.log(`Scanning frag ${fragStart} - ${fragEnd}`);

//         let fragmentCandidates: Candidate[] = [];

//         // Process candidates
//         // Start at the end of fragment so we start with the longest possible word
//         for (let end = fragEnd; end >= fragStart; end--) {
//             const candidate = sentence.substring(fragStart, end + 1);
//             const fromKanji = fromKanjiMap.get(candidate);
//             const word = fromKanji || fromKanaMap.get(candidate);

//             if (word) {
//                 fragmentCandidates.push({
//                     text: candidate,
//                     type: fromKanji ? 'kanji' : 'kana',
//                     length: candidate.length,
//                     word
//                 });
//             }
//         }

//         if (fragmentCandidates.length === 0) {
//             // No candidates found, move fragment by one
//             initFrag(fragStart + 1);
//             continue;
//         }

//         // Get longest candidate
//         fragmentCandidates.sort((a, b) => b.length - a.length);
//         const longestCandidate: Candidate | undefined = fragmentCandidates[0];
//         analysedWords.push(longestCandidate);

//         // Move fragment by found candidate length
//         initFrag(fragStart + longestCandidate.length);
//     }

//     return analysedWords;
// }

export type AnalysedToken = {
    text: string;
    pos: KuromojiPos;
    token: KuromojiToken;

    // final determined eng translation
    eng?: string;

    // because we expect an exact match with either the base or surface form,
    // we will use jmdict senses directly
    senses?: JMdictSense[];

    withFollowingText?: string;
    withFollowingEng?: string;
    withFollowingSenses?: JMdictSense[];
};

// async function idxOfMostSimilar(sources: string[], reference: string) {
//     const similarities = await Promise.all(
//         sources.map((source) => stringSimilarity(source, reference))
//     );
//     return similarities.indexOf(Math.max(...similarities));
// }

function cleanGlossEntry(text: string) {
    // get rid of brackends and trim
    text = text.replace(/\(.*?\)/g, '').trim();
    // remove "to" if it's the first word
    text = text.replace(/^to /, '');

    return text;
}

// For now simply check by starts of the words in the referemce, otherwise pick first sense
function determineBestAlignedSense(senses: JMdictSense[], reference: string) {
    let bestScore = -1;
    let bestMatch = undefined;
    for (const sense of senses) {
        for (const gloss of sense.gloss) {
            const clean = cleanGlossEntry(gloss.text);
            const score = reference
                .split(' ')
                .map((w) => w.trim().toLowerCase())
                .filter((w) => w.startsWith(clean.toLowerCase())).length;

            if (score > bestScore) {
                bestScore = score;
                bestMatch = clean;
            }
        }
    }

    return bestMatch;
}

const allowedPos: KuromojiPos[] = [
    'noun',
    'adjectival noun',
    'adjective',
    'adverb',
    'verb',
    'symbol'
    // 'auxiliary'
    // 'particle',
    // 'person name'
];

export const jmDictTagsMapping: Partial<Record<KuromojiPos, object>> =
    Object.fromEntries(
        allowedPos.map((pos) => [
            pos,
            Object.fromEntries(
                Object.entries(jmdict.tags).filter(([tag, description]) =>
                    description.includes(pos)
                )
            )
        ])
    );

async function analysis(
    sentence: string,
    reference: string, // reference in english for better polysemantic ambiguity alignment
    config?: {
        useAlignedTranslations?: boolean;
    }
): Promise<AnalysedToken[]> {
    const tokens = await tokenize(sentence);
    const intermediate = tokens.map((token) => {
        const text = token.basic_form || token.surface_form;
        const words = fromKanjiMap.get(text) || fromKanaMap.get(text);
        const pos: KuromojiPos = kuromojiPartOfSpeech[token.pos] || '';

        // flat map to senses and exclude senses that do not match POS of the token
        const senses = words
            ?.flatMap((w) => w.sense)
            ?.filter((s) => !!jmDictTagsMapping[pos]);

        return { text, pos, token, senses };
    });

    return Promise.all(
        intermediate.map((token, idx) =>
            (async () => {
                const withFollowingText = intermediate
                    .slice(idx, idx + 2)
                    .map((x) => x.text)
                    .join('');
                const withFollowingWords =
                    fromKanjiMap.get(withFollowingText) ||
                    fromKanaMap.get(withFollowingText);
                const withFollowingSenses = withFollowingWords
                    ?.flatMap((w) => w.sense)
                    ?.filter((s) => !!jmDictTagsMapping[token.pos]);

                return {
                    ...token,
                    eng: determineBestAlignedSense(
                        token.senses || [],
                        reference
                    ),
                    withFollowingText,
                    withFollowingWords,
                    withFollowingEng: determineBestAlignedSense(
                        withFollowingSenses || [],
                        reference
                    )
                };
            })()
        )
    );
}

async function analyzeEntries(entry: SrtEntry, reference: SrtEntry) {
    const tokens = await analysis(
        entry.lines.join(' '),
        reference.lines.join(' ')
    );

    const sensesLine = tokens
        .map((t, idx) => hueColorizeSrt(t.eng || '', idx))
        .join(' • ');
    const tokensLine = tokens
        .map((t, idx) => hueColorizeSrt(t.text, idx))
        .join(' • ');

    const out: SrtEntry = {
        ...entry,
        lines: [sensesLine, tokensLine, ...entry.lines, ...reference.lines]
    };
    return out;
}

async function fetchLyricsTranslateLyrics(url: string) {
    console.log(`Fetching ${url}`.green);
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}`);
    }

    const html = await response.text();
    const dom = new JSDOM(html);

    type Lyric = {
        id: string;
        jp: string;
        en?: string;
    };

    const title: Lyric = {
        id: 'title',
        jp: dom.window.document
            .querySelector('#song-title > h1')
            .textContent.trim(),
        en: dom.window.document
            .querySelector('#translation-title > h1')
            .textContent.trim()
    };

    const lyrics: Lyric[] = [
        ...dom.window.document.querySelectorAll('#song-body .par > div')
    ].map((lyricDiv) => ({
        id: lyricDiv.classList[0],
        jp: lyricDiv.textContent.trim(),
        en: dom.window.document
            .querySelector(`#translation-body .${lyricDiv.classList[0]}`)
            ?.textContent?.trim()
    }));

    const analyzed: (Lyric & { analyzed: AnalysedToken[] })[] =
        await Promise.all(
            lyrics.map(async (lyric) => ({
                ...lyric,
                analyzed: await analysis(lyric.jp, lyric.en || '')
            }))
        );

    for (const lyric of analyzed) {
        console.log(`\n\n${lyric.jp}`.green);
        console.log(`${lyric.en}`.magenta);
        console.log();
        complexPrintTable(lyric.analyzed);
    }
}

function complexPrintTable(
    tokens: AnalysedToken[],
    withTokenComplex = false,
    shortened = 100
) {
    const tbl = new Table();

    tbl.push(tokens.map((t) => (t.eng ? t.text.green : t.text.white)));
    tbl.push(
        tokens.map((t) =>
            t.eng
                ? toHiragana(t.token.reading).green
                : toHiragana(t.token.reading).white
        )
    );
    tbl.push(tokens.map((t) => t.pos.slice(0, 3).grey));
    tbl.push(
        tokens.map((t) =>
            t.eng ? (t.eng.length > shortened ? '***' : t.eng.magenta) : ''
        )
    );
    tbl.push(
        tokens.map((t) =>
            t.withFollowingEng
                ? t.withFollowingEng.length > shortened
                    ? '***'
                    : t.withFollowingEng.cyan
                : ''
        )
    );

    if (withTokenComplex) {
        console.log();
        console.log(
            tokens
                .map(
                    (t) =>
                        `${t.text.yellow} -> ${t.pos.cyan} [${t.senses?.map(
                            (s) =>
                                s.gloss
                                    .map((g) => cleanGlossEntry(g.text))
                                    .join(', ')
                        )}]`
                )
                .join(`\n`)
        );
    }

    console.log(tbl.toString());
}

async function main() {
    const cmd = process.argv[2];
    // No command, show help
    if (cmd === undefined) {
        console.log(`Usage: node conductor.js [command]`.yellow);
        return;
    }

    // analyze
    if (cmd === 'srt') {
        const jpFile = process.argv[3];
        const enFile = process.argv[4];
        const srtJp = readFileSync(jpFile, 'utf8');
        const entriesJp = fromSrt(srtJp);
        const srtEn = readFileSync(enFile, 'utf8');
        const entriesEn = fromSrt(srtEn);

        // analyze with reference
        const analysed = await Promise.all(
            entriesJp.map((entry, idx) => analyzeEntries(entry, entriesEn[idx]))
        );

        // save to analyzed srt
        const outFile = jpFile.replaceAll('.srt', '.conductor.srt');
        writeFileSync(outFile, toSrt(analysed));
        console.log(`Saved analyzed srt to ${outFile}`.green);
    }

    if (cmd === 'lyricstranslate') {
        const url = process.argv[3];
        await fetchLyricsTranslateLyrics(url);
    }
}

main().catch((err) => console.error(err));
