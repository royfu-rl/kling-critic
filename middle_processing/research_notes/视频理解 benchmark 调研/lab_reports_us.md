# 视频理解 Benchmark 调研：美国三家（Google / OpenAI / Anthropic）

- 截止日期：2026-11-08
- 范围：各家最新旗舰和快速档模型。同一家族里更早的模型，只有在它们发过视频分数时才收录
- 方法：逐个打开官方 model card、eval-methodology PDF、发布博客和 system card 核对；本地快照（leaderboard.html，导出日 2026-11-03）只当线索，不当来源

---

## 0. 结论速览

- **Google**
  - 三家里只有 Google 报视频分数
  - 现役模型只报一项：**LVBench**，Google 自己测，不用工具
  - Gemini 4 Argon 91.7%，Gemini 3.8 Flash 87.8%（agentic）/ 87.1%（static）
  - 上一代 Gemini 3 Pro / 3 Flash 报的是 **Video-MMMU**（87.6% / 86.9%）。之后的 3.1 Pro、3.5 Flash、3.6 Flash 自己的评测表里都没有视频项
  - Gemini 4 Carbon（10-28 发布，目前最强）的评测表里也没有视频项
- **OpenAI**
  - GPT-6 Astra、GPT-6 Sol/Luna、GPT-6.1 Sol、GPT-5.6 Sol/Terra/Luna 都**没有任何视频 benchmark**
  - 多模态只报 MMMU-Pro、gdp.pdf、ScreenSpot-Pro、BenchCAD 等
- **Anthropic**
  - Claude Opus 5.5、Fable 5.1（含 Mythos 5.1）、Sonnet 5.5 都**没有任何视频 benchmark**
  - 多模态只报 Chartography
- **快照里 GPT / Claude 的 LVBench 分数不是他们自己报的**
  - 全部出自 Google 评测表里的竞品列，由 Google 自己测
  - 每个模型给的帧数不同：Gemini 用 1 FPS 或 1024 帧；Claude 只给 300 或 600 帧；GPT 给 800 或 1024 帧。Google 的解释是"受 API 限制"
- **找到的自建（内部）视频 benchmark：0 个**
  - 只有 Gemini 4 Argon 博客里的 "Video-to-Sim-to-Real" 内部演示（看视频学玩 cornhole 沙包游戏），没有分数，不算 benchmark

---

## 1. 厂商报告的视频分数（按 Benchmark 分组）

> "来源类型"里写"Google 代测"的行：分数是 Google 放在自家评测表里给竞品测的，**不是 OpenAI / Anthropic 自己报的**。

### 1.1 LVBench（长视频理解，公开 benchmark）

| Benchmark | 模型 | 分数 | 设置/备注 | 来源类型 | 来源 URL | 自建? |
|---|---|---|---|---|---|---|
| LVBench | Gemini 4 Argon | 91.7% | Google 自测、不用工具；Gemini 用 1 FPS；最高 thinking 档；博客称 SOTA；结果截至 2026-10 | Model card + Eval methodology PDF + Blog | https://deepmind.google/models/model-cards/gemini-4-argon/ ；https://storage.googleapis.com/deepmind-media/gemini/gemini_4_argon_model_evaluation.pdf ；https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-argon/ | 否 |
| LVBench | Gemini 3.8 Flash | 87.8%（agentic）/ 87.1%（static） | Google 自测，1024 帧；methodology 写的是 "self computed without tools"，表里却标了 agentic，agentic 具体怎么设置没写；结果截至 2026-09 | Model card + Eval methodology PDF | https://deepmind.google/models/model-cards/gemini-3-8-flash/ ；https://storage.googleapis.com/deepmind-media/gemini/gemini_3-8_flash_model_evaluation.pdf | 否 |
| LVBench | Gemini 3.7 Flash | 85.4% | Google 自测，1024 帧，不用工具；3.8 Flash 的表里也引用了这个数；结果截至 2026-08 | Eval methodology PDF | https://storage.googleapis.com/deepmind-media/gemini/gemini_3-7_flash_model_evaluation.pdf | 否 |
| LVBench | Gemini 3.6 Flash | 84.2% | 出现在 3.7 Flash 的表里（3.6 Flash 自己的表没有视频项）；1024 帧 | Eval methodology PDF（3.7 Flash） | 同上 | 否 |
| LVBench | GPT-6 Astra | 87.5% | **Google 代测**，800 帧（API 限制）；OpenAI 自己没报 | Eval PDF（Google 代测） | https://storage.googleapis.com/deepmind-media/gemini/gemini_4_argon_model_evaluation.pdf | 否 |
| LVBench | Claude Opus 5.5 | 83.7% | **Google 代测**，600 帧；Anthropic 自己没报 | Eval PDF（Google 代测） | 同上 | 否 |
| LVBench | Claude Fable 5.1 | 79.7% | **Google 代测**，300 帧；Anthropic 自己没报 | Eval PDF（Google 代测） | 同上 | 否 |
| LVBench | GPT-5.6 Sol | 82.1% | **Google 代测**，1024 帧 | Eval PDF（Google 代测） | https://storage.googleapis.com/deepmind-media/gemini/gemini_3-8_flash_model_evaluation.pdf | 否 |
| LVBench | GPT-5.6 Terra | 78.9% | **Google 代测**，1024 帧（3.7 Flash 和 3.8 Flash 两张表都有） | Eval PDF（Google 代测） | 同上；以及 gemini_3-7_flash_model_evaluation.pdf | 否 |
| LVBench | Claude Opus 5 | 75.4% | **Google 代测**，300 帧 | Eval PDF（Google 代测） | gemini_3-8_flash_model_evaluation.pdf | 否 |
| LVBench | Claude Sonnet 5 | 68.5% | **Google 代测**，300 帧（3.7 Flash 和 3.8 Flash 两张表都有） | Eval PDF（Google 代测） | gemini_3-8_flash / gemini_3-7_flash_model_evaluation.pdf | 否 |

### 1.2 Video-MMMU（从视频里学知识，公开 benchmark）

| Benchmark | 模型 | 分数 | 设置/备注 | 来源类型 | 来源 URL | 自建? |
|---|---|---|---|---|---|---|
| Video-MMMU | Gemini 3 Pro | 87.6% | media_resolution=HIGH（每帧 280 tokens），temperature=0；结果截至 2025-11（同家族更早的模型） | Eval methodology PDF | https://storage.googleapis.com/deepmind-media/gemini/gemini_3_pro_model_evaluation.pdf | 否 |
| Video-MMMU | Gemini 3 Flash | 86.9% | 设置同上；结果截至 2025-12 | Eval methodology PDF | https://storage.googleapis.com/deepmind-media/gemini/gemini_3_flash_model_evaluation.pdf | 否 |

- 附：这两张表里还有 Google 给竞品代测的 Video-MMMU 分数，都是老模型
  - Gemini 2.5 Pro 83.6%，Gemini 2.5 Flash 79.2%
  - Claude Sonnet 4.5 77.8%
  - GPT-5.1 80.4%，GPT-5.2（Extra high）85.9%
- Google 从 Gemini 3.1 Pro 起，评测表里不再有 Video-MMMU

### 1.3 其他视频 benchmark

- 官方材料里都**没找到**以下 benchmark 的分数：Video-MME、Video-MME v2、MMVU、MLVU、LongVideoBench、MVBench、EgoSchema、Perception Test、Charades-STA、VSI-Bench、Minerva、Video-Holmes
- 三家都一样，自建视频 benchmark 也没有

---

## 2. 没有发布任何视频分数的模型

- **OpenAI**（launch 页和 system card 都查过）
  - GPT-6 Astra（2026-09-03）
  - GPT-6 Sol、GPT-6 Luna（2026-09-22）
  - GPT-6.1 Sol（2026-09-29）
  - GPT-5.6 Sol、Terra、Luna（2026-07-09；其中 "Sol Ultra" 只是多 agent 并行的 `ultra` 模式，不是单独的模型）
  - 说明：OpenAI 目前没有叫 **"GPT-6 Ultra"** 的模型
- **Anthropic**（launch 页和 system card 都查过）
  - Claude Opus 5.5（2026-09-22）
  - Claude Fable 5.1 / Mythos 5.1（2026-09-01）
  - Claude Sonnet 5.5（2026-09-28）
  - 三个模型的多模态部分都只有 Chartography
- **Google**（这几个模型自己的评测表里没有视频项）
  - Gemini 4 Carbon（2026-10-28）
  - Gemini 3.5 Flash（2026-05）
  - Gemini 3.1 Pro（2026-02）
  - Gemini 3.6 Flash（2026-07；它的 LVBench 84.2% 是后来 3.7 Flash 的表里补出来的）

---

## 3. 本地快照核对（leaderboard.html，2026-11-03）

- **核对一致，已作为官方数据写进第 1 节**
  - "Gemini 4.0" LVBench 91.70 → 就是 **Gemini 4 Argon**。官方没有叫 "Gemini 4.0" 的模型，Gemini 4 系列只有 Argon 和 Carbon
  - Gemini 3.8 Flash LVBench 87.10 / 87.80A → 一致
  - GPT-5.6 Sol 82.10、GPT-5.6 Terra 78.90、Claude Opus 5.5 83.70、Claude Fable 5.1 79.70、Claude Opus 5 75.40、Claude Sonnet 5 68.50 → 数值一致，但都是 **Google 代测**，不是厂商自己报的
- **标错名字**
  - 快照里 "GPT-6 Ultra" LVBench 87.50 → OpenAI 没有这个模型。87.5% 和 Google Argon 表里给 **GPT-6 Astra** 代测的分数一样，应该是把 Astra 标成了 Ultra
- **"A" 列的含义标错了**
  - 快照说双数格子是"标准 / Agentic"，但 Video-MME 2 这一列的第二个数其实是 **Non-Lin Score**（benchmark 作者设计的分组非线性得分），不是 agentic
  - 证据：Gemini 3 Pro 66.1 / 49.4、Gemini 3 Flash 61.1 / 42.5，和 Video-MME v2 作者榜单（https://video-mme-v2.netlify.app/）上的 Avg Acc / Non-Lin Score 完全对得上
  - 这几个分数是 benchmark 作者测的，Google 自己没报
- **只在快照里有、找不到官方来源**（来源标为 "leaderboard snapshot only"）

| Benchmark | 模型 | 快照分数 | 核对结果 | 来源 |
|---|---|---|---|---|
| Video-MME v2 | Gemini 3.8 Flash | 70.20 / 55.10A | Google 材料和 Video-MME v2 官方榜单里都没有 | leaderboard snapshot only |
| Video-MME | Gemini 3.5 Flash | 87.20 | 3.5 Flash 的 model card 和 eval PDF 都没有视频项 | leaderboard snapshot only |
| LVBench | Gemini 3.5 Flash | 85.40 | 同上；这个数和 3.7 Flash 的官方值 85.4% 一样，**可能是把 3.7 Flash 的分数挂到了 3.5 Flash 名下** | leaderboard snapshot only |
| MMVU | Gemini 3.5 Flash | 81.10 | 同上 | leaderboard snapshot only |
| VideoMMMU | Gemini 3.5 Flash | 88.00 | 同上 | leaderboard snapshot only |
| Video-MME | Gemini 3.1 Pro | 86.70 | 3.1 Pro 的 eval PDF 没有视频项 | leaderboard snapshot only |
| Video-MME v2 | Gemini 3.1 Pro | 66.90 | Video-MME v2 官方榜单没有 3.1 Pro | leaderboard snapshot only |
| LVBench | Gemini 3.1 Pro | 75.10 | 同上（3.1 Pro 的 eval PDF 没有视频项） | leaderboard snapshot only |
| MMVU | Gemini 3.1 Pro | 77.90 | 同上 | leaderboard snapshot only |
| VideoMMMU | Gemini 3.1 Pro | 85.30 | 同上 | leaderboard snapshot only |
| VideoMMMU | Gemini 3.0 Flash | 88.10 | **和官方对不上**：Google 官方是 86.9% | leaderboard snapshot only（与官方冲突） |
| Video-MME / LVBench / MMVU | Gemini 3.0 Flash | 85.20 / 73.90（76.30A）/ 77.90 | Google 官方表里没有这几项 | leaderboard snapshot only |

- 推测：上表大部分可能来自 Qwen / Seed / MiMo 等国内厂商技术报告里的竞品对比列。这一点**没有核实**，不能当成 Google 自报

---

## 4. 方法学注意事项

- **帧数不对等**
  - Google 给自家模型 1 FPS 或 1024 帧，给 Claude 300 或 600 帧，给 GPT 800 或 1024 帧
  - 各家 LVBench 分数之间横向比，会系统性偏向 Gemini
- **Gemini 3.8 Flash 的 "agentic" 87.8%**
  - methodology 说 LVBench 不用工具，但表里同时列了 agentic 和 static 两个数，agentic 怎么跑的没有说明
- **openai.com 直接访问返回 403**
  - OpenAI launch 页的正文是通过 r.jina.ai 镜像读到的
  - system card 是直接从 deploymentsafety.openai.com 下载的

---

## 5. Sources

- **Google**
  - Gemini 4 Argon model card：https://deepmind.google/models/model-cards/gemini-4-argon/
  - Gemini 4 Argon eval methodology：https://deepmind.google/models/evals-methodology/gemini-4-argon （301 跳转到 https://storage.googleapis.com/deepmind-media/gemini/gemini_4_argon_model_evaluation.pdf ）
  - Gemini 4 Argon 博客（LVBench 91.7% SOTA）：https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-argon/
  - Gemini 4 Argon 博客（Video-to-Sim-to-Real 演示）：https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-argon/
  - Gemini 4 Carbon 博客：https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-carbon/
  - Gemini 4 Carbon eval PDF：https://storage.googleapis.com/deepmind-media/gemini/gemini_4_carbon_model_evaluation.pdf
  - Gemini 3.8 Flash model card：https://deepmind.google/models/model-cards/gemini-3-8-flash/
  - Gemini 3.8 Flash eval PDF：https://storage.googleapis.com/deepmind-media/gemini/gemini_3-8_flash_model_evaluation.pdf
  - Gemini 3.8 Flash 博客：https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/
  - Gemini 3.7 Flash eval PDF：https://storage.googleapis.com/deepmind-media/gemini/gemini_3-7_flash_model_evaluation.pdf
  - Gemini 3.6 Flash eval PDF：https://storage.googleapis.com/deepmind-media/gemini/gemini_3-6_flash_model_evaluation.pdf
  - Gemini 3.5 Flash model card：https://deepmind.google/models/model-cards/gemini-3-5-flash/
  - Gemini 3.5 Flash eval PDF：https://storage.googleapis.com/deepmind-media/gemini/gemini_3-5_flash_model_evaluation.pdf
  - Gemini 3.1 Pro eval PDF：https://storage.googleapis.com/deepmind-media/gemini/gemini_3-1_pro_model_evaluation.pdf
  - Gemini 3 Pro eval PDF：https://storage.googleapis.com/deepmind-media/gemini/gemini_3_pro_model_evaluation.pdf
  - Gemini 3 Flash eval PDF：https://storage.googleapis.com/deepmind-media/gemini/gemini_3_flash_model_evaluation.pdf
- **OpenAI**
  - GPT-6 Astra launch：https://openai.com/index/gpt-6-astra/
  - GPT-6 Astra system card：https://deploymentsafety.openai.com/gpt-6-astra
  - GPT-6 Sol & Luna：https://openai.com/index/introducing-gpt-6-sol-and-luna/
  - GPT-6.1 Sol：https://openai.com/index/introducing-gpt-6-1-sol/
  - GPT-5.6 launch：https://openai.com/index/gpt-5-6/
  - GPT-5.6 system card：https://deploymentsafety.openai.com/gpt-5-6/gpt-5-6.pdf
  - GPT-6 开发者指南：https://developers.openai.com/api/docs/guides/latest-model
- **Anthropic**
  - Claude Opus 5.5：https://www.anthropic.com/claude-opus-5-5
  - Opus 5.5 system card：https://www-cdn.anthropic.com/fc1b44717c85dc068bc6ba5024219938094694bd/Claude%20Opus%205.5%20System%20Card.pdf
  - Claude Fable 5.1 & Mythos 5.1：https://www.anthropic.com/claude-fable-and-mythos-5-1
  - Fable 5.1 system card：https://www-cdn.anthropic.com/0339e6a7c5c7b87f5c07798616dc32c215d14235/Claude%20Fable%205.1%20&%20Claude%20Mythos%205.1%20System%20Card.pdf
  - Claude Sonnet 5.5：https://www.anthropic.com/claude-sonnet-5-5
  - Sonnet 5.5 system card：https://www-cdn.anthropic.com/870c8f525702625d2c62fc6dd04c857e3250bec1/Claude%20Sonnet%205.5%20System%20Card.pdf
- **Benchmark 作者榜单**（用来核对快照，不是厂商来源）
  - Video-MME v2 项目页 / 榜单：https://video-mme-v2.netlify.app/
  - Video-MME v2 GitHub：https://github.com/MME-Benchmarks/Video-MME-v2
- **本地快照**（只当线索）
  - /mmu_mllm_hdd_4/deep-research/kim-leaderboard/output/leaderboard.html

