import { JMdict } from '@scriptin/jmdict-simplified-types';
import cors from 'cors';
import express from 'express';
import { readFileSync } from 'fs';
import { toHiragana } from 'wanakana';
import {
    AnalysedToken,
    analysis,
    dict as conductorDict,
    initJmdict
} from '../app/conductor';

function extractTokens(tokens: AnalysedToken[]) {
    return tokens.map((token, index) => ({
        text: token.surface,
        base: token.base,
        baseKana: toHiragana(token.baseKana),
        eng: token.eng,
        engMore: token.engMore,
        direct: token.direct,
        phrases: token.phrases,
        reading: toHiragana(token.token.reading),
        pos: token.pos,
        phrasesDirect: token.phrasesDirect
    }));
}

async function main() {
    const dict: JMdict = JSON.parse(
        readFileSync('public/jmdict-eng-3.5.0.json', 'utf8')
    );
    await initJmdict(dict);

    const app = express();
    app.use(express.json());
    app.use(cors());
    app.use(express.urlencoded({ extended: true }));

    const port = 10942;

    app.get('/', async (req, res) => {
        res.send('Conductor running.');
    });

    app.post('/analyze', async (req, res) => {
        const jp = req.body.jp;
        const en = req.body.en;

        console.log(req.body);

        if (
            typeof jp !== 'string' ||
            !(typeof en === 'string' || typeof en === 'undefined')
        ) {
            return res.status(400).json({
                error: 'jp and en must be strings'
            });
        }

        const results = await analysis(jp, en || '');

        return res.json(extractTokens(results.filter((token) => !!token)));
    });

    app.post('/analyze-q', async (req, res) => {
        const jp = req.query.jp;
        const en = req.query.en;

        if (
            typeof jp !== 'string' ||
            typeof en !== 'string' ||
            typeof en !== 'undefined'
        ) {
            return res.status(400).json({
                error: 'jp and en must be strings'
            });
        }

        const results = await analysis(jp, en || '');

        return res.json(extractTokens(results.filter((token) => !!token)));
    });

    app.post('/lookup', async (req, res) => {
        const jp = req.body.jp;

        if (typeof jp !== 'string') {
            return res.status(400).json({
                error: 'jp string required'
            });
        }

        const words =
            conductorDict.fromKanaMap.get(jp) ||
            conductorDict.fromKanjiMap.get(jp);

        return res.json(
            words?.map((w) => ({
                kanji: w.kanji.filter((k) => k.common).map((k) => k.text),
                kana: w.kana.map((k) => k.text),
                senses: w.sense.flatMap((s) => s.gloss.map((g) => g.text))
            }))
        );
    });

    app.listen(port, () => {
        console.log(`Server is running at http://localhost:${port}`);
    });
}

main().catch(console.error);
