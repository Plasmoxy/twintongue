/**
 * Conductor Japanese text analyser and token-wise translator by Plasmoxy.
 *
 * TODO:
 * [ ] add support for 2-token, (maybe later 3-token) dictionary scans -> there is probably the 'expression' POS like in yomichan
 * [ ] higher priority for matching POS on kuromoji->jmdict lookup
 * [ ] kana kanji map lookup not respecting if the returned kanji is common or not (not sorted !)
 * [ ] remove stop words and grammatical english stuff from glos alignment (maybe conditional based on POS?)
 *
 * BUG NOTES:
 * https://www.youtube.com/watch?v=gs6DaLaIwmk&t=1631s　30:58 どうやって nepickuje jak expression
 *
 * NOTES:
 * - interesting similar software https://subs2srs.sourceforge.net/
 *
 */

import {
    JMdict,
    JMdictGloss,
    JMdictSense,
    JMdictWord
} from '@scriptin/jmdict-simplified-types';
import 'colors';
import { KuromojiToken, tokenize } from 'kuromojin';
import { uniqBy } from 'lodash';
import {
    KuromojiPos,
    kuromojiPartOfSpeech,
    kuromojiToJmdictTagsMapping
} from './kuromoji-lexical';
import { cleanText } from './text';

export type Sense = JMdictSense & {
    word: JMdictWord;
};

export type Candidate = {
    text: string;
    type: 'kanji' | 'kana';
    length: number;
    word: JMdictWord;
};

export type AlignedGlossMatch = {
    sense: Sense;
    gloss: JMdictGloss;
    sensePosScore: number;
    glossScore: number;
};

export type Dict = {
    jmdict: JMdict;
    fromKanjiMap: Map<string, JMdictWord[]>;
    fromKanaMap: Map<string, JMdictWord[]>;
};

export type Phrase = {
    text: string;
    length: number;
    senses: Sense[];
};

export type PhraseTexts = {
    text: string;
    length: number;
    texts: string[];
};

export type AnalysedToken = {
    text: string; // base form
    surface: string; // surface japanese form of the token (non-base form)

    base: string; // base japanese form by JMDict dictionary word alignment
    baseKana: string; // kana (reading) of the base word

    pos: KuromojiPos;
    token: KuromojiToken;

    // final determined eng translations
    eng?: string;
    engMore?: string[]; // additional short translations
    direct: string[]; // pos-only match without ref
    phrases: string[]; // multi-token matched phrases

    // because we expect an exact match with either the base or surface form,
    // we will use jmdict senses directly
    senses: Sense[];

    // raw aligned gloss
    // best gloss matches are at the start
    alignedGloss: AlignedGlossMatch[];
    alignedPhrases: AlignedGlossMatch[];

    phrasesDirect: PhraseTexts[];
};

export const DISABLE_GLOSS_SCORE_SORT_ON_POS: KuromojiPos[] = ['particle'];

const inspect = (obj: any) => console.dir(obj, { depth: null });

export const dict: Dict = {} as Dict;

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

    // console.log(dict);
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
    senses: Sense[],
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
    sentence = cleanText(sentence);
    reference = cleanText(reference);

    if (!dict.jmdict)
        throw new Error('jmdict not initialized, please call initJmdict()');

    const kmojiDicPath =
        typeof process !== undefined
            ? 'node_modules/kuromoji/dict'
            : '/kuromoji';

    const tokens = await tokenize(sentence, {
        dicPath: kmojiDicPath
    });

    // First process individual tokens
    const intermediate = tokens.map((token) => {
        const text = token.basic_form || token.surface_form;
        const surface = token.surface_form;
        const words = dict.fromKanjiMap.get(text) || dict.fromKanaMap.get(text);
        const pos: KuromojiPos = kuromojiPartOfSpeech[token.pos] || '';

        const senses: Sense[] | undefined = words?.flatMap((word) =>
            word.sense.flatMap((s) => ({ word, ...s }))
        );

        return { text, surface, pos, token, senses };
    });

    return intermediate.map((token, idx) => {
        // --- Single token ---

        const alignedGloss = determineBestAlignedSenses(
            token.senses || [],
            reference,
            token.pos
        );

        // max 4 words direct glossary entry
        const glossShortFilter = (g: AlignedGlossMatch) =>
            g.gloss.text.split(/['"\s]/i).length <= 4 &&
            g.gloss.text.length < 23;

        const alignedGlossShort = alignedGloss.filter(glossShortFilter);

        // direct gloss with no reference align = only POS align
        const directGlossShort = determineBestAlignedSenses(
            token.senses || [],
            '',
            token.pos
        ).filter(glossShortFilter);

        // --- Phrases (multi token) ---

        const phrases: Phrase[] = [];

        // lookahead relative from this token and try to lookup 4,3,2 token phrases
        for (let length = 4; length >= 2; length--) {
            // skip if out of bounds
            // TODO: needs testing
            if (idx + length > intermediate.length) continue;

            const phraseText = intermediate
                .slice(idx, idx + length)
                .map((x) => x.surface)
                .join('');

            const words =
                dict.fromKanjiMap.get(phraseText) ||
                dict.fromKanaMap.get(phraseText);

            const newPhrases: Phrase[] | undefined = words?.flatMap((w) => ({
                text: phraseText,
                length,
                senses: w.sense.flatMap((s) => ({ word: w, ...s }))
            }));

            if (newPhrases) {
                phrases.push(...newPhrases);
            }
        }

        // sort by length on top
        phrases.sort((a, b) => b.length - a.length);

        const alignedPhrases = determineBestAlignedSenses(
            phrases.flatMap((p) => p.senses) || [],
            reference,
            undefined // do not match POS with phrase senses
        );

        // pick base form from the jmdict word of first aligned sense
        const baseWord = alignedGloss[0]?.sense?.word;

        return {
            ...token,
            base:
                baseWord?.kanji.filter((k) => k.common)[0]?.text ||
                baseWord?.kana.filter((k) => k.common)[0]?.text ||
                '',
            baseKana: baseWord?.kana.filter((k) => k.common)[0]?.text || '',

            // aligned short
            eng: cleanGlossEntry(alignedGlossShort[0]?.gloss.text || ''),
            engMore: alignedGlossShort
                .slice(1, 3)
                .map((g) => cleanGlossEntry(g.gloss.text)),

            // direct POS-aligned short
            direct: directGlossShort
                .slice(0, 3)
                .map((g) => cleanGlossEntry(g.gloss.text)),

            phrases: alignedPhrases.slice(0, 3).map((g) => g.gloss.text),

            // raw aligned gloss
            alignedGloss,
            alignedPhrases,

            phrasesDirect: phrases.map((p) => ({
                text: p.text,
                length: p.length,
                texts: p.senses.flatMap((s) => s.gloss.flatMap((g) => g.text))
            }))
        };
    });
}
