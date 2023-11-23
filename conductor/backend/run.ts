import { JMdict } from '@scriptin/jmdict-simplified-types';
import express from 'express';
import { readFileSync } from 'fs';
import { initJmdict } from '../app/conductor';

async function main() {
    const dict: JMdict = JSON.parse(
        readFileSync('public/jmdict-eng-3.5.0.json', 'utf8')
    );
    await initJmdict(dict);

    const app = express();
    const port = 3000;

    app.get('/', (req, res) => {
        res.send('Conductor running.');
    });

    app.listen(port, () => {
        console.log(`Server is running at http://localhost:${port}`);
    });
}

main().catch(console.error);
