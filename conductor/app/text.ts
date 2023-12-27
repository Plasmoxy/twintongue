export function cleanText(text: string): string {
    text = text.replace(/<[^>]*>/g, '');
    text = text.replace(/\s+/g, ' ').trim();

    return text;
}
