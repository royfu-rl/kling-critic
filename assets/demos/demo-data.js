// 各 benchmark 的真实样本。标注取自官方文件原文；两段视频用远程 zip 的中央目录
// 定位后按字节区间取出，未做转码。字段：bench / src / clip / dur / gt / q / a / cat。
const DEMOS = {
 "charades-sta": {
  "bench": "Charades-STA",
  "src": "charades_sta_test.txt · MA6GY",
  "clip": "MA6GY.mp4",
  "dur": 33.4,
  "gt": [
   [
    9.5,
    16.0
   ]
  ],
  "q": "person begins to take some medicine.",
  "a": "<span class=\"t\">9.5s – 16.0s</span><span class=\"sub\">同一段视频另有 3 条查询，各自对应一段：0.0–6.8s「opens a box of groceries」、16.9–22.2s「puts the others back in the box」</span>",
  "cat": "单段时序定位（Temporal Grounding）；Charades-STA 不给逐条类别标签"
 },
 "nextgqa": {
  "bench": "NExT-GQA",
  "src": "test split · 5478970215",
  "clip": "5478970215.mp4",
  "dur": 10.5,
  "gt": [
   [
    2.4,
    4.5
   ],
   [
    4.9,
    7.0
   ],
   [
    7.4,
    10.0
   ]
  ],
  "q": "why is the lady in white moving her lips as she stood at the side",
  "opts": [
   {
    "t": "talking to cameraman",
    "hit": true
   },
   {
    "t": "wiping her lips",
    "hit": false
   },
   {
    "t": "drinking water",
    "hit": false
   },
   {
    "t": "making her speech",
    "hit": false
   },
   {
    "t": "shivering",
    "hit": false
   }
  ],
  "a": "talking to cameraman<span class=\"sub\">支撑证据 3 段：2.4–4.5s / 4.9–7.0s / 7.4–10.0s，共同支撑同一个答案</span>",
  "cat": "CW · Causal-Why（NExT-QA 官方九类问题类型之一）"
 },
 "qvhighlights": {
  "bench": "QVHighlights",
  "src": "highlight_val_release.jsonl · qid 2638",
  "novid": "源视频托管在 YouTube（bP5KfdFJzC4，取 60–210s 片段），<br>需登录凭证才能取回，此处不转存。<br>标注为官方原文。",
  "q": "Woman in plaid shirt sits still by a red couch.",
  "a": "<span class=\"t\">0–74s / 76–142s / 144–150s</span><span class=\"sub\">三段合起来构成同一个高光事件；命中 73 个 clip，每 clip 2 秒，各带 3 名标注员的 1–5 分显著性</span>",
  "cat": "Moment Retrieval + Highlight Detection；QVHighlights 不给逐条类别标签"
 },
 "activitynet-tal": {
  "bench": "ActivityNet v1.3 · TAL",
  "src": "activity_net.v1-3.min.json · UWgzslG97MQ",
  "novid": "源视频托管在 YouTube（UWgzslG97MQ，220.4s），<br>需登录凭证才能取回，此处不转存。<br>标注为官方原文。",
  "q": "Surfing　<span style='color:var(--dim);font-size:12px'>（查询是一个动作类别名，不是一句描述）</span>",
  "a": "<span class=\"t\">10 个实例</span><span class=\"sub\">17.2–27.5 / 33.7–44.0 / 49.8–58.1 / 65.3–73.9 / 81.8–89.4 / 94.5–127.2 / 133.0–146.1 / 151.9–172.6 / 178.8–190.1 / 199.7–213.5（秒）　模型事先不知道有 10 个</span>",
  "cat": "Surfing（ActivityNet 200 类动作分类体系中的一类）"
 }
};

