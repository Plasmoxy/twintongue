import { JMdict } from '@scriptin/jmdict-simplified-types';
import express from 'express';
import { readFileSync } from 'fs';
import { toHiragana } from 'wanakana';
import { AnalysedToken, analysis, initJmdict } from '../app/conductor';

function extractToken(token: AnalysedToken) {
    return {
        text: token.text,
        eng: token.eng,
        reading: toHiragana(token.token.reading),
        pos: token.pos,
        alignedGlossTexts: token.alignedGloss.map((g) => g.gloss.text)
    };
}

async function main() {
    const dict: JMdict = JSON.parse(
        readFileSync('public/jmdict-eng-3.5.0.json', 'utf8')
    );
    await initJmdict(dict);

    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    const port = 3000;

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

        return res.json(results.map((token) => extractToken(token)));
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

        return res.json(
            results
                .filter((token) => !!token)
                .map((token) => extractToken(token))
        );
    });

    app.listen(port, () => {
        console.log(`Server is running at http://localhost:${port}`);
    });
}

main().catch(console.error);
