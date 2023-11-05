import { getTokenizer, tokenize } from 'kuromojin';

getTokenizer().then((tokenizer) => {});

tokenize(
    '私はこのゲームはもう何回か遊んでいるんですけどもトロフィーの開始をしようと思っているので分かりやすいように'
).then((tokens) => {
    console.log(tokens);
});
