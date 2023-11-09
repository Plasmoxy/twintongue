/**
 * Conductor Japanese text analyser and token-wise translator by Plasmoxy.
 *
 * TODO:
 * [ ] add support for 2-token, (maybe later 3-token) dictionary scans -> there is probably the 'expression' POS like in yomichan
 * [ ] higher priority for matching POS on kuromoji->jmdict lookup
 */

import {
    JMdict,
    JMdictGloss,
    JMdictSense,
    JMdictWord
} from '@scriptin/jmdict-simplified-types';
import Table from 'cli-table3';
import 'colors';
import { KuromojiToken, tokenize } from 'kuromojin';
import { uniqBy } from 'lodash';
import { toHiragana } from 'wanakana';
import { parseLrtLyrics } from './dom';
import { hueColorizeSrt } from './hue-colors';
import {
    KuromojiPos,
    kuromojiPartOfSpeech,
    kuromojiToJmdictTagsMapping
} from './kuromoji-lexical';
import { SrtEntry } from './srt-tools';

export type Candidate = {
    text: string;
    type: 'kanji' | 'kana';
    length: number;
    word: JMdictWord;
};

export type AlignedGlossMatch = {
    sense: JMdictSense;
    gloss: JMdictGloss;
    sensePosScore: number;
    glossScore: number;
};

export type Dict = {
    jmdict: JMdict;
    fromKanjiMap: Map<string, JMdictWord[]>;
    fromKanaMap: Map<string, JMdictWord[]>;
};

export type AnalysedToken = {
    text: string; // base form
    surface: string; // surface form as in text

    pos: KuromojiPos;
    token: KuromojiToken;

    // final determined eng translation
    eng?: string;

    // because we expect an exact match with either the base or surface form,
    // we will use jmdict senses directly
    senses: JMdictSense[];

    // aligned gloss
    // best gloss matches are at the start
    alignedGloss: AlignedGlossMatch[];

    withFollowingText?: string;
    withFollowingEng?: string;
    withFollowingSenses?: JMdictSense[];
    withFollowingAlignedGloss?: AlignedGlossMatch[];
};

export type LrtLyric = {
    id: string;
    jp: string;
    en?: string;
};

export const DISABLE_GLOSS_SCORE_SORT_ON_POS: KuromojiPos[] = ['particle'];

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

    console.log(dict);
    console.log(`Initialized jmdict with ${jmdict.words.length} words`);
}

export function cleanGlossEntry(text: string) {
    // get rid of brackends and trim
    text = text.replace(/\(.*?\)/g, '').trim();
    // remove "to" if it's the first word
    text = text.replace(/^to /, '');

    return text;
}

// Custom text similarity for gloss cmp
function getGlossScore(text: string, ref: string): number {
    const refTrimmed = ref.trim();
    let score = refTrimmed
        .toLowerCase()
        .includes(cleanGlossEntry(text).toLowerCase())
        ? 1
        : 0;

    // additional score by entire word present
    const tWords = text
        .trim()
        .split(' ')
        .map((w) => w.trim());
    const refWords = refTrimmed.split(' ').map((w) => w.trim());
    if (refWords.some((word) => tWords.includes(word))) {
        score += 1;
    }

    return score;
}

// Pick the best sense from the list that would match the reference.
// Sort priority:
// 1. matching POS
// 2. term from gloss is in reference
export function determineBestAlignedSenses(
    senses: JMdictSense[],
    reference: string,
    targetPos?: KuromojiPos
): AlignedGlossMatch[] {
    // get flat glosses
    const combined = senses.flatMap((sense) =>
        sense.gloss.map((gloss) => ({
            sense,
            gloss,
            sensePosScore:
                sense.partOfSpeech.filter(
                    (p) => !!kuromojiToJmdictTagsMapping[targetPos || '']?.[p]
                ).length > 0
                    ? 1
                    : 0,
            glossScore: getGlossScore(gloss.text, reference)
        }))
    );

    const unique = uniqBy(combined, (x) => x.gloss.text);

    // sort by scores
    // note: on some POS we don't want to sort by gloss score like particles
    // TODO: is this good?
    const sorted = unique.sort(
        DISABLE_GLOSS_SCORE_SORT_ON_POS.includes(targetPos)
            ? (a, b) => b.sensePosScore - a.sensePosScore
            : (a, b) =>
                  b.sensePosScore - a.sensePosScore ||
                  b.glossScore - a.glossScore
    );

    return sorted;
}

export async function analysis(
    sentence: string,
    reference: string // reference in english for better polysemantic ambiguity alignment
): Promise<AnalysedToken[]> {
    const tokens = await tokenize(sentence, {
        // support statically served kuromoji dict resources for browser
        dicPath: typeof window === undefined ? undefined : '/kuromoji'
    });

    // First process individual tokens
    const intermediate = tokens.map((token) => {
        const text = token.basic_form || token.surface_form;
        const surface = token.surface_form;
        const words = dict.fromKanjiMap.get(text) || dict.fromKanaMap.get(text);
        const pos: KuromojiPos = kuromojiPartOfSpeech[token.pos] || '';
        const senses = words?.flatMap((w) => w.sense);

        return { text, surface, pos, token, senses };
    });

    return intermediate.map((token, idx) => {
        const withFollowingText = intermediate
            .slice(idx, idx + 2)
            .map((x) => x.text)
            .join('');
        const withFollowingWords =
            dict.fromKanjiMap.get(withFollowingText) ||
            dict.fromKanaMap.get(withFollowingText);

        const withFollowingSenses = withFollowingWords?.flatMap((w) => w.sense);

        const alignedGloss = determineBestAlignedSenses(
            token.senses || [],
            reference,
            token.pos
        );
        const alignedGlossFollowing = determineBestAlignedSenses(
            withFollowingSenses || [],
            reference,
            undefined // do not match POS with 2-token senses
        );

        return {
            ...token,
            eng: cleanGlossEntry(alignedGloss[0]?.gloss.text || ''),
            withFollowingText,
            withFollowingWords,
            withFollowingEng: cleanGlossEntry(
                alignedGlossFollowing[0]?.gloss.text || ''
            ),
            withFollowingSenses,

            alignedGloss,
            alignedGlossFollowing
        };
    });
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
    const lyrics = await parseLrtLyrics(html);
    const analyzed: (LrtLyric & { analyzed: AnalysedToken[] })[] =
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
