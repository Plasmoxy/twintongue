/** BL manga ocr parse?
 *
 * CSM ocr:
 * JP:  /Users/seb/git/bilingual-manga/bm_build\(home\)/ocr/bafybeidgkaxwpvcvrssv7fidiz47zc6legbgpqlg5il4f6yhlkmvgvrfpm.json
 *
 *  easyocr -l en --paragraph True --output_format json --beamWidth 10 --allowlist $'ABCDEFGHIJKLMNOPQRSTUVWXYZ.,!?- \'' -f /Users/seb/git/twintongue/conductor/prepro.jpg
 *
 */

import { JMdict } from '@scriptin/jmdict-simplified-types';
import fs, { readFileSync } from 'fs';
import sharp from 'sharp';
import { PSM, createWorker } from 'tesseract.js';
import { toHiragana } from 'wanakana';
import { AnalysedToken, analysis, initJmdict } from '../app/conductor';
import { EXCLUDED_TOKENS } from '../app/excluded-tokens';

const bldir = '/Users/seb/git/bilingual-manga/bm_build(home)';

async function preprocessImage(inputImagePath: string): Promise<Buffer> {
    // Load the image using Sharp
    const image = sharp(inputImagePath);

    // Binarize the image
    const binarizedImage = await image
        .greyscale() // Convert to grayscale
        .threshold(100) // Apply threshold (adjust threshold value as needed)
        .toBuffer();

    return binarizedImage;
}

function saveBase64ImageToFile(
    base64Image: string,
    outputFilePath: string
): void {
    // Extract the data part of the Base64 string
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

    // Create a buffer from the Base64 data
    const buffer = Buffer.from(base64Data, 'base64');

    // Write the buffer to a file
    fs.writeFileSync(outputFilePath, buffer);
}

async function conductorAnalyse(jp: string, en: string) {
    const vocabMap = new Map<string, AnalysedToken>();

    const tokens = await analysis(jp, en);

    // map through tokens
    for (const t of tokens) {
        const disabledPos = [
            'symbol',
            'punctuation',
            'number',
            'particle',
            'filler'
        ];

        // phrase
        for (const phrase of t.phrasesDirect) {
            if (phrase.length >= 3 && !vocabMap.has(phrase.text)) {
                vocabMap.set(phrase.text, t);
            }
        }

        // such token would be colored on the conductor FE
        const isSignificant =
            !EXCLUDED_TOKENS.some(
                (ex) =>
                    (ex.text === t.text || ex.text === t.base) &&
                    ex.pos === t.pos
            ) && !disabledPos.includes(t.pos);

        // skip if not significant
        if (!isSignificant) continue;

        // this token vocab
        const tokenJp = t.base || t.surface; // base form primarily (kanji / kana)

        if (tokenJp === undefined) continue;

        vocabMap.set(tokenJp, t);
    }

    return [...vocabMap.values()].map(
        (t) =>
            `${t.text} (${toHiragana(t.token.reading)}) - ${t.direct.join(
                ', '
            )}`
    );
}

async function tesseractOcr(
    enFilePath: string,
    segmentJp: any,
    enOffsetTop = 0,
    enOffsetLeft = 0
) {
    const worker = await createWorker('eng', undefined, {});

    await worker.setParameters({
        tessedit_char_whitelist:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?- '",
        tessedit_pageseg_mode: PSM.SINGLE_COLUMN
    });

    // calculate rectangle for en
    const enMeta = await sharp(enFilePath).metadata();

    // calculate midpoints on new image
    const midTop =
        ((segmentJp.top + segmentJp.height / 2) / segmentJp.img_h) *
        enMeta.height;
    const midLeft =
        ((segmentJp.left + segmentJp.width / 2) / segmentJp.img_w) *
        enMeta.width;

    // calc new size of rect
    const xscale = 1.5;
    const yscale = 1.5;
    const height =
        (segmentJp.height / segmentJp.img_h) * enMeta.height * yscale;
    const width = (segmentJp.width / segmentJp.img_w) * enMeta.width * xscale;

    const rectangleEn = {
        top: midTop - height / 2 + enOffsetTop,
        left: midLeft - width / 2 + enOffsetLeft,
        height,
        width
    };

    // console.log({ rectangleEn });

    const prepro = await preprocessImage(enFilePath);
    fs.writeFileSync('prepro.jpg', prepro);

    const rec = await worker.recognize(
        prepro,
        {
            rotateAuto: true,
            rectangle: rectangleEn
        },
        { imageBinary: true, imageColor: true, imageGrey: true }
    );

    // save base64 to files with sharp
    saveBase64ImageToFile(rec.data.imageBinary, 'test-bin.png');
    saveBase64ImageToFile(rec.data.imageColor, 'test-col.png');
    saveBase64ImageToFile(rec.data.imageGrey, 'test-grey.png');

    const text = rec.data.text.replace(/\n/g, ' ').trim().toLowerCase();
    await worker.terminate();

    return text;
}

async function main() {
    // init dict
    const dict: JMdict = JSON.parse(
        readFileSync('public/jmdict-eng-3.5.0.json', 'utf8')
    );
    await initJmdict(dict);

    // BL manga data
    const data: any[] = JSON.parse(
        readFileSync(`${bldir}/json/admin.manga_data.json`, 'utf8')
    );

    const id = '635d545a6d960eb0ac756afe';
    const found = data.find((x) => x['_id']['$oid'] === id);

    const chapter = 1;
    const enOffset = -7;

    const chDataJp = found['jp_data']['ch_jp'][chapter];
    const chHeaderJp = found['jp_data']['ch_jph'][chapter - 1].replace(
        '/%@rep@%',
        ''
    );

    const chDataEn = found['en_data']['ch_en'][chapter];
    const chHeaderEn = found['en_data']['ch_enh'][chapter - 1].replace(
        '/%@rep@%',
        ''
    );

    // BL OCR source for JP
    const ocrJpFile = `${bldir}/ocr/bafybeidgkaxwpvcvrssv7fidiz47zc6legbgpqlg5il4f6yhlkmvgvrfpm.json`;
    const ocrJp = JSON.parse(readFileSync(ocrJpFile, 'utf8'));

    // zip chDataJp and chDataEn
    const chData = chDataJp.map((jp, i) => {
        const ocrId = jp.split('.').slice(0, -1).join('.');
        const ocr = ocrJp[ocrId];
        const texts = ocr.map((ocrEntry) => ocrEntry.lines.join(''));

        return {
            jp: `${bldir}/ipfs/${chHeaderJp}/${jp}`,
            en: `${bldir}/ipfs/${chHeaderEn}/${chDataEn[i + enOffset]}`,
            ocrJp: ocr,
            textsJp: texts
        };
    });

    const demo = chData[65];

    console.log({ demo });

    for (const [i, ocr] of demo.ocrJp.entries()) {
        const jpText = demo.textsJp[i];
        const enText = await tesseractOcr(demo.en, ocr, 10, -10);
        console.log({ jpText, enText });

        const results = await conductorAnalyse(jpText, enText);
        console.log(results);
    }
}

main().catch(console.error);
