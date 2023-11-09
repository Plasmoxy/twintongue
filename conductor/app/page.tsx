'use client';
import { useEffect, useState } from 'react';
import { AnalysedToken, analysis, initJmdict } from './conductor';
import { huePallete } from './hue-colors';

const rljp = `
もう一回、もう一回。
「私は今日も転がります。」と、
少女は言う　少女は言う
言葉に意味を奏でながら！`;
const rlen = `One more time, one more time.
"I'll roll today too."
The girl says, the girl says
While playing with the meanings in her words!`;

export default function Home() {
    const [info, setInfo] = useState<string>('');
    const [jpText, setJpText] = useState(rljp);
    const [enText, setEnText] = useState(rlen);

    const [analysed, setAnalysed] = useState<AnalysedToken[]>([]);

    useEffect(() => {
        (async () => {
            setInfo('Loading jmdict');
            const dict = await fetch('/jmdict-eng-3.5.0.json').then((r) =>
                r.json()
            );
            await initJmdict(dict);
            setInfo('Dict loaded, ready to go.');
        })().catch((e) => {
            console.log(e);
            setInfo('Error loading jmdict');
        });
    }, []);

    useEffect(() => {
        (async () => {
            const result = await analysis(jpText, enText);
            setAnalysed(result);
        })().catch((e) => console.log(e));
    }, [jpText, enText]);

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

                <div className="my-10">
                    <label
                        htmlFor="small-input"
                        className="block mb-2 text-md text-gray-900 dark:text-white"
                    >
                        JP
                    </label>
                    <textarea
                        className="block w-full p-2 text-gray-900 border border-rose-100 bg-black text-white rounded-lg min-h-[100px] text-[20px]"
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
                        className="block w-full p-2 text-gray-900 border border-rose-100 bg-black text-white rounded-lg min-h-[100px]"
                        value={enText}
                        onChange={(e) => setEnText(e.target.value)}
                    />
                </div>

                <div className="my-10 text-[30px] font-light text-white leading-[100px]">
                    {analysed.map((token, idx) => (
                        <ruby>
                            <span
                                style={{
                                    color: huePallete[idx % huePallete.length]
                                }}
                            >
                                {token.text}
                            </span>
                            <rt style={{ color: '#d9d9d9' }}>
                                <span>{token.eng}</span>
                            </rt>
                        </ruby>
                    ))}
                </div>
            </div>
        </main>
    );
}
