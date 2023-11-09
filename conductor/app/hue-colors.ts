export const huePallete: string[] = [
    '#10ebb0',
    '#1eabe3',
    '#8e54eb',
    '#54eba2',
    '#54e3eb',
    '#7dbcf0'
];

export function hueColorizeSrt(text: string, index: number) {
    const hue = index % huePallete.length;
    return `<span style="color: ${huePallete[hue]}">${text}</span>`;
}
