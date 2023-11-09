'use client';
import { useEffect, useState } from 'react';
import { toHiragana } from 'wanakana';
import { AnalysedToken, analysis, initJmdict } from './conductor';
import { huePallete } from './hue-colors';

const rljp = `
もう一回、もう一回。
「私は今日も転がります。」と、
少女は言う少女は言う
言葉に意味を奏でながら！`;
const rlen = `One more time, one more time.
"I'll roll today too."
The girl says, the girl says
While playing with the meanings in her words!`;

export default function Home() {
    const [info, setInfo] = useState<string>('');
    const [jpText, setJpText] = useState(rljp);
    const [enText, setEnText] = useState(rlen);
    const [lineByLine, setLineByLine] = useState<boolean>(false);

    const [analysed, setAnalysed] = useState<(AnalysedToken | 'sep')[]>([]);

    useEffect(() => {
        (async () => {
            setInfo('Loading jmdict');
            const dict = await fetch('/jmdict-eng-3.5.0.json', {
                cache: 'force-cache'
            }).then((r) => r.json());
            await initJmdict(dict);
            setInfo('Dict loaded, ready to go.');
        })().catch((e) => {
            console.log(e);
            setInfo('Error loading jmdict');
        });
    }, []);

    useEffect(() => {
        (async () => {
            let result: (AnalysedToken | 'sep')[];

            if (lineByLine) {
                // by jp lines
                result = [];
                const jpLines = jpText.split('\n');
                const enLines = enText.split('\n');
                for (let i = 0; i < jpLines.length; i++) {
                    const line = await analysis(jpLines[i], enLines[i]);
                    result.push(...line);
                    result.push('sep');
                }
            } else {
                // by entire text
                result = await analysis(jpText, enText);
            }
            setAnalysed(result);
        })().catch((e) => console.log(e));
    }, [jpText, enText, lineByLine]);

    return (
        <main className="flex min-h-screen flex-col items-center justify-between p-24">
            <div className="container">
                <h1 className="text-xl font-bold mb-10">Plasmoxy Conductor</h1>
                <p>
                    Frontend for conductor - kuromoji dictionary alignment tool.
                </p>
                <br />
                <p className="text-teal-100">{info}</p>
                <br />

                <label className="relative inline-flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        checked={lineByLine}
                        onChange={(e) => setLineByLine(e.target.checked)}
                        className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">
                        Analyze line by line
                    </span>
                </label>

                <div className="my-10">
                    <label
                        htmlFor="small-input"
                        className="block mb-2 text-md text-gray-900 dark:text-white"
                    >
                        JP
                    </label>
                    <textarea
                        className="block w-full p-2 text-gray-900 border border-rose-100 bg-black text-white rounded-lg min-h-[150px] text-[20px]"
                        value={jpText}
                        onChange={(e) => setJpText(e.target.value)}
                    />
                </div>

                <div className="my-10">
                    <label
                        htmlFor="small-input"
                        className="block mb-2 text-md text-gray-900 dark:text-white"
                    >
                        EN
                    </label>
                    <textarea
                        className="block w-full p-2 text-gray-900 border border-rose-100 bg-black text-white rounded-lg min-h-[150px]"
                        value={enText}
                        onChange={(e) => setEnText(e.target.value)}
                    />
                </div>

                <div className="my-10 text-[34px] font-light text-white leading-[100px]">
                    {analysed.map((token, idx) =>
                        token === 'sep' ? (
                            <br />
                        ) : (
                            <ruby key={`${idx}${token.text}`}>
                                <ruby>
                                    <span
                                        style={{
                                            color: huePallete[
                                                idx % huePallete.length
                                            ]
                                        }}
                                    >
                                        {token.text}
                                    </span>
                                    <rt style={{ color: '#d9d9d9' }}>
                                        {toHiragana(token.token.reading)}
                                    </rt>
                                </ruby>
                                <rt
                                    style={{
                                        color: huePallete[
                                            idx % huePallete.length
                                        ]
                                    }}
                                >
                                    <span>{token.eng}</span>
                                </rt>
                            </ruby>
                        )
                    )}
                </div>
            </div>
        </main>
    );
}
