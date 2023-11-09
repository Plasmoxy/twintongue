'use server';
import { JSDOM } from 'jsdom';
import type { LrtLyric } from './conductor';

export async function parseLrtLyrics(html: string): Promise<LrtLyric[]> {
    const dom = new JSDOM(html);

    const title: LrtLyric = {
        id: 'title',
        jp: dom.window.document
            .querySelector('#song-title > h1')
            .textContent.trim(),
        en: dom.window.document
            .querySelector('#translation-title > h1')
            .textContent.trim()
    };

    const lyrics: LrtLyric[] = [
        ...dom.window.document.querySelectorAll('#song-body .par > div')
    ].map((lyricDiv) => ({
        id: lyricDiv.classList[0],
        jp: lyricDiv.textContent.trim(),
        en: dom.window.document
            .querySelector(`#translation-body .${lyricDiv.classList[0]}`)
            ?.textContent?.trim()
    }));

    return lyrics;
}
