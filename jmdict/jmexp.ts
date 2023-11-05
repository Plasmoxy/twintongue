import { JMdict, JMdictWord } from '@scriptin/jmdict-simplified-types';
import { readFileSync } from 'fs';
import { KuromojiToken, tokenize } from 'kuromojin';
import { KuromojiPos, kuromojiPartOfSpeech } from './kuromoji-lexical';

const srtsample = `このゲームはですね本当に雰囲気がある来て bgm もすごくいいいいんですよなので出来るだけ`;
const inspect = (obj: any) => console.dir(obj, { depth: null });

console.log('Loading dict');
const jmdict: JMdict = JSON.parse(
    readFileSync('jmdict-eng-3.5.0.json', 'utf8')
);
console.log('Loaded dict');

// map from kanji to word
const fromKanjiMap = new Map<string, JMdictWord[]>();
const fromKanaMap = new Map<string, JMdictWord[]>();
for (const word of jmdict.words) {
    for (const kanji of word.kanji) {
        fromKanjiMap.set(kanji.text, [
            word,
            ...(fromKanjiMap.get(kanji.text) || [])
        ]);
    }
    for (const kana of word.kana) {
        fromKanaMap.set(kana.text, [
            word,
            ...(fromKanaMap.get(kana.text) || [])
        ]);
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

    eng?: string;

    words?: JMdictWord[];
    withFollowingText?: string;
    withFollowingEng?: string;
    withFollowingWords?: JMdictWord[];
};

async function analysis(sentence: string): Promise<AnalysedToken[]> {
    const tokens = await tokenize(sentence);
    const intermediate = tokens.map((token) => ({
        text: token.surface_form,
        pos: kuromojiPartOfSpeech[token.pos],
        token,
        words:
            fromKanjiMap.get(token.surface_form) ||
            fromKanaMap.get(token.surface_form)
    }));

    return intermediate.map((token, idx) => {
        const withFollowingText = intermediate
            .slice(idx, idx + 2)
            .map((x) => x.text)
            .join('');
        const withFollowingWords =
            fromKanjiMap.get(withFollowingText) ||
            fromKanaMap.get(withFollowingText);
        return {
            ...token,
            eng: token.words?.[0]?.sense[0]?.gloss[0]?.text,
            withFollowingText,
            withFollowingWords,
            withFollowingEng: withFollowingWords?.[0]?.sense[0]?.gloss[0]?.text
        };
    });
}

const allowedPos: KuromojiPos[] = [
    'noun',
    'adjectival noun',
    'adjective',
    'adverb',
    'verb',
    'particle',
    'person name'
];

async function main() {
    const tokens = await analysis(srtsample);

    console.log(
        tokens
            .map(
                (t) =>
                    `${
                        t.withFollowingEng
                            ? t.withFollowingEng.length > 20
                                ? '==='
                                : t.withFollowingEng
                            : '---'
                    }`
            )
            .join(` • `)
    );
    console.log();
    console.log(tokens.map((t) => `${t.text}`).join(` • `));
    console.log();
    console.log(
        tokens
            .map(
                (t) => `${t.eng ? (t.eng.length > 20 ? '===' : t.eng) : '---'}`
            )
            .join(` • `)
    );

    console.log();
    console.log(
        tokens
            .map(
                (t) =>
                    `${t.text} -> ${t.pos} [${t.words?.map((w) =>
                        w.sense
                            ?.map((s) => s.gloss.map((g) => g.text).join(', '))
                            .join(', ')
                    )}]`
            )
            .join(`\n`)
    );
}

main().catch((err) => console.error(err));
