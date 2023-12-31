/**
 * Manipulate Korean subtitles alongside with https://translatesubtitles.co/ translation
 * to get triple merged subtitles for learning Korean.
 */

import { readFile, writeFile } from 'fs/promises';

console.log(`Huehangeul - parallel subtitle constructor`);
const cmd = process.argv[2];
const file = process.argv[3];

const pallete: string[] = [
    '#10ebb0',
    '#1eabe3',
    '#8e54eb',
    '#54eba2',
    '#54e3eb',
    '#7dbcf0'
];

// Black magic straight from Voldemort used
// to trick google translate translation model to translate words separately
const SEGMENT = (word: string, idx: number) => `[W${idx}@@ ${word} @@W${idx}]`;
const DESEGMENT_RE = /(\[W\s?\d+\s?@\s?@\s*|\s*@\s?@\s?W\s?\d+\s?\])/g;

interface Entry {
    idx: number;
    timestamp: string;
    lines: string[];
}

function fromSrt(file: string): Entry[] {
    return file
        .replace(/\r/g, '')
        .split(/\n\n/)
        .map((entry) => {
            const [idx, timestamp, ...lines] = entry.split('\n');
            return {
                idx: Number(idx),
                timestamp,
                // remove <br> and <br/> tags
                lines: lines.map((l) => l.replace(/<br\/?>/g, ''))
            };
        });
}

function toSrt(entries: Entry[]): string {
    return entries
        .map((entry) => {
            return `${entry.idx}\n${entry.timestamp}\n${entry.lines.join(
                '<br>\n'
            )}`;
        })
        .join('\n\n');
}

(async () => {
    if (!cmd || !file) {
        console.log(`Usage: node hue.js <command> <file>`);
        console.log(`Commands: segment, desegment, colorize, merge`);
        return;
    }

    // --- Merge multiple srt files ---

    if (cmd === 'merge') {
        const names = process.argv.slice(3);
        const files = await Promise.all(names.map((name) => readFile(name)));
        const [first, ...others] = files.map((file) =>
            fromSrt(file.toString())
        );

        // iterate over first entry set and add entries from others
        for (const sourceEntry of first) {
            // Merge other sets entries if idx matches
            for (const otherSet of others) {
                const otherEntry = otherSet.find(
                    (entry) => entry.idx === sourceEntry.idx
                );
                if (otherEntry) {
                    sourceEntry.lines.push(...otherEntry.lines);
                }
            }
        }

        await writeFile(`${file}.merged.srt`, toSrt(first));
        console.log(`Saved ${file}.merged.srt`);

        return; // done
    }

    // --- Normal commands for single file ---

    const f = await readFile(file);

    // get rid of windows CR, double break means entry separator
    let entries = fromSrt(f.toString());

    console.log(`Loaded ${file}`);

    if (cmd === 'segment') {
        console.log(`Segmenting ...`);
        for (const entry of entries) {
            entry.lines = entry.lines.map((line) =>
                line.split(/ /g).map(SEGMENT).join(' ')
            );
        }
    }

    if (cmd === 'desegment') {
        console.log(`Desegmenting ...`);
        for (const entry of entries) {
            entry.lines = entry.lines.map((line) =>
                line.replace(DESEGMENT_RE, '')
            );
        }
    }

    // Colorize by space
    if (cmd === 'colorize') {
        for (const entry of entries) {
            entry.lines = entry.lines.map((line, lineIdx) => {
                return line
                    .split(/ /g)
                    .map((word, wordIdx) => {
                        const hue = wordIdx % pallete.length;
                        return `<span style="color: ${pallete[hue]}">${word}</span>`;
                    })
                    .join(' ');
            });
        }
    }

    // Colorize by inter segment space
    if (cmd === 'colorize-segmented') {
        for (const entry of entries) {
            entry.lines = entry.lines.map((line, lineIdx) => {
                return (
                    line
                        // split by segment borders
                        .split(/\]\s*\[/g)
                        .map((word, wordIdx) => {
                            const hue = wordIdx % pallete.length;
                            // inject segment borders back
                            return `<span style="color: ${pallete[hue]}">[${word}]</span>`;
                        })
                        .join(' ')
                        // remove double segment borders
                        .replace(/\]\]/g, ']')
                        .replace(/\[\[/g, '[')
                );
            });
        }
    }

    const reconstructed = entries
        .map((entry) => {
            return `${entry.idx}\n${entry.timestamp}\n${entry.lines.join(
                '\n'
            )}`;
        })
        .join('\n\n');

    await writeFile(`${file}.${cmd}.srt`, reconstructed);
    console.log(`Saved ${file}.${cmd}.srt`);
})();
