import { analysis } from './conductor';
import { hueColorizeSrt } from './hue-colors';
import { SrtEntry } from './srt-tools';

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
