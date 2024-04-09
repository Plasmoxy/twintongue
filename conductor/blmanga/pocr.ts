/** BL manga ocr parse?
 *
 * CSM ocr:
 * JP:  /Users/seb/git/bilingual-manga/bm_build\(home\)/ocr/bafybeidgkaxwpvcvrssv7fidiz47zc6legbgpqlg5il4f6yhlkmvgvrfpm.json
 *
 *
 *
 */

import { JMdict } from '@scriptin/jmdict-simplified-types';
import fs, { readFileSync } from 'fs';
import sharp from 'sharp';
import { PSM, createWorker } from 'tesseract.js';
import { initJmdict } from '../app/conductor';

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
    const enOffset = -4;

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
    const chData = chDataJp.map((jp, i) => ({
        jp: `${bldir}/ipfs/${chHeaderJp}/${jp}`,
        w: jp.split('.').slice(0, -1).join('.'),
        jpOcr: ocrJp[jp.split('.').slice(0, -1).join('.')],
        en: `${bldir}/ipfs/${chHeaderEn}/${chDataEn[i + enOffset]}`
    }));

    // Tesseract
    const worker = await createWorker('eng', undefined, {});

    await worker.setParameters({
        tessedit_char_whitelist:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?- '",
        tessedit_pageseg_mode: PSM.SINGLE_COLUMN
    });

    // select page and segment
    const page = chData[10];
    const segmentJp = page.jpOcr[3];

    // calculate rectangle for en
    const enMeta = await sharp(page.en).metadata();

    const enOffsetTop = 0;
    const enOffsetLeft = 20;

    const rectangleEn = {
        top: (segmentJp.top / segmentJp.img_h) * enMeta.height + enOffsetTop,
        left: (segmentJp.left / segmentJp.img_w) * enMeta.width + enOffsetLeft,
        width: (segmentJp.width / segmentJp.img_w) * enMeta.width,
        height: (segmentJp.height / segmentJp.img_h) * enMeta.height
    };

    console.log({ rectangleEn });

    const rec = await worker.recognize(
        await preprocessImage(page.en),
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

    console.log(text);
}

main().catch(console.error);
