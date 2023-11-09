import type { LrtLyric } from './conductor';

export async function parseLrtLyrics(html: string): Promise<LrtLyric[]> {
    const el = document.createElement('html');
    el.innerHTML = html;

    const title: LrtLyric = {
        id: 'title',
        jp: el.querySelector('#song-title > h1').textContent.trim(),
        en: el.querySelector('#translation-title > h1').textContent.trim()
    };

    const lyricsDivs = Array.from(el.querySelectorAll('#song-body .par > div'));

    const lyrics: LrtLyric[] = lyricsDivs.map((lyricDiv: Element) => ({
        id: lyricDiv.classList[0],
        jp: lyricDiv.textContent.trim(),
        en: el
            .querySelector(`#translation-body .${lyricDiv.classList[0]}`)
            ?.textContent?.trim()
    }));

    return lyrics;
}
