export interface SrtEntry {
    idx: number;
    timestamp: string;
    lines: string[];
}

export function fromSrt(file: string): SrtEntry[] {
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

export function toSrt(entries: SrtEntry[]): string {
    return entries
        .map((entry) => {
            return `${entry.idx}\n${entry.timestamp}\n${entry.lines.join(
                '<br>\n'
            )}`;
        })
        .join('\n\n');
}
