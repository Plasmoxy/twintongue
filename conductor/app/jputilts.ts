export function containsKanji(input) {
    // Regular expression for kanji characters
    const kanjiRegex = /[\u4E00-\u9FFF]/;

    // Check if the input string contains any kanji characters
    return kanjiRegex.test(input);
}

// TODO: maybe rework to {Script} /u matcher
export function isHiraganaOnly(input) {
    // Regular expression for hiragana characters
    const hiraganaRegex = /^[\u3040-\u309F]+$/;

    // Check if the input string contains only hiragana characters
    return hiraganaRegex.test(input);
}

export function containsNoJapanese(text) {
    const regex =
        /^[^\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]*$/u;
    return regex.test(text);
}
