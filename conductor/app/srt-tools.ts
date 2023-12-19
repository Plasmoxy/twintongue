export interface SrtEntry {
    idx: number;
    timestamp: number;
    lines: string[];
}

export function timestampToMs(timestamp: string): number | undefined {
    const regex = /(\d{2}):(\d{2}):(\d{2}),(\d{3})/;
    const match = timestamp.match(regex);
    if (!match) {
        return undefined;
    }
    const [, hours, minutes, seconds, ms] = match;
    return (
        Number(hours) * 3600000 +
        Number(minutes) * 60000 +
        Number(seconds) * 1000 +
        Number(ms)
    );
}

export function fromSrt(file: string): SrtEntry[] {
    return file
        .replace(/\r/g, '')
        .split(/\n\n/)
        .map((entry) => {
            const [idx, timestamp, ...lines] = entry.split('\n');
            return {
                idx: Number(idx),
                timestamp: timestampToMs(timestamp),
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
