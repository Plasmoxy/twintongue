import axios from 'axios';

export const ANKI_URL = 'http://127.0.0.1:8765';

export interface AnkiConnectRequest {
    action: string;
    version: number;
    params: any;
}

export interface AnkiCardData {
    Front: string;
    Back: string;
}

export async function createAnkiDeck(deckName) {
    const ankiConnectRequest: AnkiConnectRequest = {
        action: 'createDeck',
        version: 6,
        params: {
            deck: deckName
        }
    };

    return await axios.post(ANKI_URL, ankiConnectRequest);
}

export async function sendDeckToAnki(
    deckName: string,
    cardData: AnkiCardData[]
) {
    const ankiConnectRequest: AnkiConnectRequest = {
        action: 'addNotes',
        version: 6,
        params: {
            notes: cardData.map((card, index) => ({
                deckName: deckName,
                modelName: 'Basic',
                fields: card,
                options: {
                    allowDuplicate: false
                },
                tags: ['conductor', `conductor::${deckName}`],
                audio: [],
                video: [],
                picture: []
            }))
        }
    };

    return await axios.post(ANKI_URL, ankiConnectRequest);
}

export async function findNotes(query: string) {
    const ankiConnectRequest: AnkiConnectRequest = {
        action: 'findNotes',
        version: 6,
        params: { query }
    };
    return await axios.post(ANKI_URL, ankiConnectRequest);
}

export async function addTag(notes: number[], tag: string) {
    const ankiConnectRequest: AnkiConnectRequest = {
        action: 'addTags',
        version: 6,
        params: {
            notes,
            tags: tag
        }
    };
    return await axios.post(ANKI_URL, ankiConnectRequest);
}
