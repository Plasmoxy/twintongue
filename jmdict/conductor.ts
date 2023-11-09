/**
 * Conductor Japanese text analysis by Plasmoxy.
 */

import {
    JMdict,
    JMdictSense,
    JMdictWord
} from '@scriptin/jmdict-simplified-types';
import Table from 'cli-table3';
import { JSDOM } from 'jsdom';
import { KuromojiToken, tokenize } from 'kuromojin';
import { toHiragana } from 'wanakana';
import { hueColorizeSrt } from './hue-colors';
import { KuromojiPos, kuromojiPartOfSpeech } from './kuromoji-lexical';
import { SrtEntry } from './srt-tools';

export type Candidate = {
    text: string;
    type: 'kanji' | 'kana';
    length: number;
    word: JMdictWord;
};

export type Dict = {
    jmdict: JMdict;
    fromKanjiMap: Map<string, JMdictWord[]>;
    fromKanaMap: Map<string, JMdictWord[]>;
    tagsMapping: Partial<Record<KuromojiPos, object>>;
};

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

// Allowed POS from kuromoji
export const allowedPos: KuromojiPos[] = [
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

const inspect = (obj: any) => console.dir(obj, { depth: null });

let dict: Dict = {} as Dict;

export async function initJmdict(jmdict: JMdict) {
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

    dict.jmdict = jmdict;
    dict.fromKanjiMap = fromKanjiMap;
    dict.fromKanaMap = fromKanaMap;
    dict.tagsMapping = Object.fromEntries(
        allowedPos.map((pos) => [
            pos,
            Object.fromEntries(
                Object.entries(dict.jmdict.tags).filter(([tag, description]) =>
                    description.includes(pos)
                )
            )
        ])
    );
}

export function cleanGlossEntry(text: string) {
    // get rid of brackends and trim
    text = text.replace(/\(.*?\)/g, '').trim();
    // remove "to" if it's the first word
    text = text.replace(/^to /, '');

    return text;
}

// For now simply check by starts of the words in the referemce, otherwise pick first sense
export function determineBestAlignedSense(
    senses: JMdictSense[],
    reference: string
) {
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

export async function analysis(
    sentence: string,
    reference: string // reference in english for better polysemantic ambiguity alignment
): Promise<AnalysedToken[]> {
    const tokens = await tokenize(sentence);
    const intermediate = tokens.map((token) => {
        const text = token.basic_form || token.surface_form;
        const words = dict.fromKanjiMap.get(text) || dict.fromKanaMap.get(text);
        const pos: KuromojiPos = kuromojiPartOfSpeech[token.pos] || '';

        // flat map to senses and exclude senses that do not match POS of the token
        const senses = words
            ?.flatMap((w) => w.sense)
            ?.filter((s) => !!dict.tagsMapping[pos]);

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
                    dict.fromKanjiMap.get(withFollowingText) ||
                    dict.fromKanaMap.get(withFollowingText);
                const withFollowingSenses = withFollowingWords
                    ?.flatMap((w) => w.sense)
                    ?.filter((s) => !!dict.tagsMapping[token.pos]);

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

export async function analyzeSrtEntries(entry: SrtEntry, reference: SrtEntry) {
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

export async function fetchLyricsTranslate(url: string) {
    console.log(`Fetching ${url}`.green);
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}`);
    }

    const html = await response.text();
    return html;
}

export async function analyzeLyricsTranslate(html: string) {
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

export function complexPrintTable(
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

    console.log(tbl.toString());

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
}
