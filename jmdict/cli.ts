import 'colors';
import { readFileSync, writeFileSync } from 'fs';
import {
    analysis,
    analyzeLyricsTranslate,
    analyzeSrtEntries,
    complexPrintTable,
    fetchLyricsTranslate,
    loadJmdict
} from './conductor';
import { fromSrt, toSrt } from './srt-tools';

const inspect = (obj: any) => console.dir(obj, { depth: null });
const samplejap = `深海の山雰囲気なのでちっちゃい布が群れをなして泳いでるように見えますね魚のように`;
const samplereference = `It looks like a mountain in the deep sea, so it looks like small pieces of cloth are swimming in groups, like fish.`;

async function main() {
    await loadJmdict();

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
            entriesJp.map((entry, idx) =>
                analyzeSrtEntries(entry, entriesEn[idx])
            )
        );

        // save to analyzed srt
        const outFile = jpFile.replaceAll('.srt', '.conductor.srt');
        writeFileSync(outFile, toSrt(analysed));
        console.log(`Saved analyzed srt to ${outFile}`.green);
    }

    if (cmd === 'lrt') {
        const url = process.argv[3];
        await analyzeLyricsTranslate(await fetchLyricsTranslate(url));
    }

    if (cmd === 'lrtf') {
        const fname = process.argv[3];
        await analyzeLyricsTranslate(readFileSync(fname, 'utf8'));
    }

    if (cmd === 'pair') {
        const jp = process.argv[3];
        const en = process.argv[4];
        const tokens = await analysis(jp, en);
        console.log(`\n\n${jp}`.green);
        console.log(`${en}`.magenta);
        complexPrintTable(tokens, true);
    }
}

main().catch((err) => console.error(err));
