# 视频理解 Benchmark 清单：推理 / 知识 / 时序 / 运动 / 空间 / Grounding

> 调研日期：2026-11-08
> 影响力数据：2026-11-08（UTC+8）通过 GitHub API 和 HF API 实时查询
> 规则：数字只取自一手来源（论文、官方 repo、dataset card 或数据文件）；无法核实的写 "?"

## 0. 口径说明

- **发布日期**：arXiv v1 提交日期（UTC），格式 YYYY/M/D
- **影响力**
  - `GH`：GitHub stars
  - `HF 30d`：HF API 的 `downloads` 字段，即近 30 天下载量
  - `HF 累计`：HF API 的 `downloadsAllTime` 字段
  - `likes`：HF dataset 的点赞数
  - `报告`：在 2025–2026 年前沿模型技术报告 / model card 中被列入评测表的情况，均已逐份核对（报告链接见 Sources）
- **规模**：标注"(据数据文件计算)"的数字是本次下载官方标注文件后统计得到的，其余来自论文原文
- **新增条目**：TVBench、EgoTempo、Video SimpleQA 不在原始清单内。三者都同时出现在 Seed1.8 和 Seed2.0 两份 model card 的视频评测表中，满足"至少 2 份前沿报告"的标准

## 1. 总表（按发布日期排序）

| 发布日期 | 名称 | 机构 | Paper | Download | 形态 | 规模 | 影响力 | 考察能力 | Example |
|---|---|---|---|---|---|---|---|---|---|
| 2017/5/5 | Charades-STA（TALL 论文提出） | University of Southern California；Google Research | [arXiv:1705.02101](https://arxiv.org/abs/1705.02101) | GitHub [jiyanggao/TALL](https://github.com/jiyanggao/TALL)（官方）；HF 镜像 [lmms-eval/charades_sta](https://huggingface.co/datasets/lmms-eval/charades_sta) | video + 文本 query → timestamp [start, end]（R@IoU / mIoU） | 论文 v2：train 13,898 / test 4,233 个 clip-sentence 对，另有 1,378 条复杂 query<br>MLLM 常用 test 集（lmms-eval）：3,720 条 query / 1,334 个视频（据数据文件计算）<br>Charades 原视频平均约 30 s（Charades 论文 arXiv:1604.01753） | GH 219<br>HF(lmms-eval 镜像) 30d 2,681 / 累计 30,332 / likes 7<br>报告：Qwen3-VL、MiMo-VL | 给定自然语言描述，在室内日常视频中定位事件的起止时间（时序 grounding）。 | video `3MSZA.mp4`，query: "person turn a light on." → 答案 [24.3, 30.4] s<br>[来源：lmms-eval/charades_sta test 第 0 行](https://huggingface.co/datasets/lmms-eval/charades_sta) |
| 2024/3/1 | TempCompass | 北京大学；香港大学；华为诺亚方舟实验室 | [arXiv:2403.00476](https://arxiv.org/abs/2403.00476) | HF [lmms-lab/TempCompass](https://huggingface.co/datasets/lmms-lab/TempCompass)（官方 README 指向此处，现重定向至 lmms-eval/TempCompass）；GitHub [llyx97/TempCompass](https://github.com/llyx97/TempCompass) | video + MCQ / yes-no / caption matching / captioning（4 种任务形式） | 410 个视频 / 7,540 条任务指令（4 种形式）；其中 multi-choice 1,580 条（据 HF 数据）<br>时长：论文称以 30 s 以内的短、中视频为主，精确范围 ? | GH 132<br>HF 30d 7,267 / 累计 104,907 / likes 6<br>报告：Seed1.8、Keye-VL 1.5 | 用"静态内容相同、只有时序维度不同"的冲突视频，考察动作、速度、方向、事件顺序、属性变化等细粒度时序感知。 | Q: What is the man doing in the video?<br>A. dunking a basketball<br>B. dribbling a basketball<br>C. passing a basketball<br>答案：A<br>[来源：HF multi-choice test 第 0 行](https://huggingface.co/datasets/lmms-eval/TempCompass) |
| 2024/10/3 | Vinoground | University of Wisconsin–Madison | [arXiv:2410.02763](https://arxiv.org/abs/2410.02763) | HF [HanSolo9682/Vinoground](https://huggingface.co/datasets/HanSolo9682/Vinoground) | 视频-字幕反事实对 → 二选一。text score：1 个视频选 2 条字幕之一；video score：拼接视频中选片段；group score：两项都对 | 500 个反事实对 = 1,000 个视频-字幕对<br>CSV 中共 994 个不重复片段，时长 1–120 s，均值 8.4 s（据 vinoground.csv 的 start/end 计算）<br>论文称大多数视频不超过 10 s | GH 13（Vinoground/Vinoground）<br>HF 30d 1,446 / 累计 10,227 / likes 4<br>报告：? | 用反事实视频-字幕对（同样的物体和动作，只是顺序或视角不同）考察稠密时序推理。 | 正例字幕: "a toddler plays around the grass field before he picks up a water bottle and drinks"<br>反例字幕: "a toddler picks up a water bottle and drinks before he plays around the grass field"<br>（category = action）模型需为每个视频选对字幕<br>[来源：vinoground.csv index 0](https://huggingface.co/datasets/HanSolo9682/Vinoground) |
| 2024/10/10 | TVBench（新增） | Univ. of Santiago de Compostela（CiTIUS）；University of Amsterdam（QUVA Lab）；University of Technology Nuremberg | [arXiv:2410.07752](https://arxiv.org/abs/2410.07752) | HF [FunAILab/TVBench](https://huggingface.co/datasets/FunAILab/TVBench)；GitHub [daniel-cores/tvbench](https://github.com/daniel-cores/tvbench) | video + MCQ（2–4 个选项，格式与 MVBench 相同） | 2,654 条 QA，10 个任务<br>视频数：正文写 2,654，Table 7 各任务之和为 2,525，论文自身不一致<br>时长 ?（论文只给出平均帧数，范围 127–726 帧） | GH 16<br>HF 30d 3,054 / 累计 27,372 / likes 14<br>报告：Seed1.8、Seed2.0 | 排除单帧、文本和常识这几类捷径后，考察真正依赖时序信息的视频理解。 | Q: Which direction does the purple sphere move in the video?<br>Candidates: Up and to the right. / Up and to the left. / Down and to the left. / Down and to the right.<br>答案：Down and to the right.<br>[来源：HF moving_direction 第 0 行](https://huggingface.co/datasets/FunAILab/TVBench) |
| 2024/10/30 | TOMATO | Yale University；Allen Institute for AI | [arXiv:2410.23266](https://arxiv.org/abs/2410.23266) | HF [yale-nlp/TOMATO](https://huggingface.co/datasets/yale-nlp/TOMATO)；GitHub [yale-nlp/TOMATO](https://github.com/yale-nlp/TOMATO) | video + MCQ（平均 5.19 个选项，最多 7 个） | 1,417 个视频（其中 805 个为自录或生成）/ 1,484 条 QA<br>平均 9.21 s，最长 72.74 s | GH 43<br>HF 30d 556 / 累计 12,362 / likes 10<br>报告：Seed1.8、Seed2.0 | 覆盖计数、方向、旋转、形状与轨迹、速度与频率、视觉线索六类任务，考察把多帧当作连续序列来理解的视觉时序推理。 | Q: In which direction(s) did the person's hand move?<br>A. Not moving at all<br>B. Left.<br>C. Right.<br>D. First to the right then to the left.<br>E. First to the left then to the right.<br>答案：C（原始字段 answer=2，从 0 开始计）<br>[来源：HF direction split 第 0 行](https://huggingface.co/datasets/yale-nlp/TOMATO) |
| 2024/12/18 | VSI-Bench（Thinking in Space） | New York University；Yale University；Stanford University | [arXiv:2412.14171](https://arxiv.org/abs/2412.14171) | HF [nyu-visionx/VSI-Bench](https://huggingface.co/datasets/nyu-visionx/VSI-Bench)；GitHub [vision-x-nyu/thinking-in-space](https://github.com/vision-x-nyu/thinking-in-space) | 第一视角室内视频 + MCQ（按 accuracy 计分）或数值答案（按 MRA 计分） | 288 个视频（ARKitScenes 150 / ScanNet++ 50 / ScanNet 88）/ 5,130 条 QA（据 test.jsonl 计算）<br>另提供 Debiased 子集，保留 2,362 条<br>时长 ? | GH 753<br>HF 30d 16,183 / 累计 174,111 / likes 77<br>报告：Qwen3-VL | 从室内扫描视频中考察视觉空间智能：物体计数、距离与方向、尺寸估计、路径规划、物体出现顺序等。 | Q: If I am standing by the stove and facing the sofa, is the tv to my front-left, front-right, back-left, or back-right? (...)<br>A. front-left<br>B. back-right<br>C. back-left<br>D. front-right<br>答案：A<br>[来源：test.jsonl id=957](https://huggingface.co/datasets/nyu-visionx/VSI-Bench) |
| 2025/1/6 | MotionBench | 清华大学；智谱 AI | [arXiv:2501.02955](https://arxiv.org/abs/2501.02955) | HF [THUDM/MotionBench](https://huggingface.co/datasets/THUDM/MotionBench)（现重定向至 zai-org/MotionBench）；GitHub [zai-org/MotionBench](https://github.com/zai-org/MotionBench) | video + MCQ | 5,385 个视频 / 8,052 条 QA<br>dev 4,020 + test 4,034（Table 3，二者之和比总数多 2）<br>论文称主要在 10 s 以内<br>片段时长 0.6–50.0 s，均值 8.3 s（据 video_info.meta.jsonl 计算） | GH 82<br>HF 30d 18,052 / 累计 137,966 / likes 9<br>报告：Kimi K2.5、GLM-4.5V、Seed1.8、Seed2.0 | 考察细粒度运动理解，涵盖运动识别、动作顺序、重复计数、相机运动、与位置相关的运动、与运动相关的物体。 | Q: Please describe the detailed breakdown of the action in the video.<br>A. Jump, Lay down, Stand<br>B. Jump, Stand, Lay down<br>C. Lay down, Stand, Jump<br>答案：C（Action Order / Gaming 类）<br>[来源：MotionBench/video_info.meta.jsonl 第 1 行](https://huggingface.co/datasets/zai-org/MotionBench) |
| 2025/1/21 | MMVU | Yale NLP（论文署名 "Yale NLP MMVU Team"） | [arXiv:2501.12380](https://arxiv.org/abs/2501.12380) | HF [yale-nlp/MMVU](https://huggingface.co/datasets/yale-nlp/MMVU)；GitHub [yale-nlp/MMVU](https://github.com/yale-nlp/MMVU) | video + MCQ（5 选 1，共 1,858 条）/ 开放问答（1,142 条） | 1,529 个视频 / 3,000 条 QA（validation 1,000 + test 2,000），覆盖 27 个学科<br>平均 51.4 s，最长 228 s | GH 77<br>HF 30d 3,396 / 累计 49,702 / likes 60<br>报告：Qwen3-VL、Qwen3.5、Kimi K2.5、GLM-4.5V、Keye-VL 1.5、Seed1.8、Seed2.0 | 基于科学、医疗、人文社科、工程四大领域的专业视频，考察专家级领域知识与推理。 | Q: Assume that 2.24 liters of gas fully participates in the reaction shown in the video under the standard temperature and pressure condition, how many grams of precipitate are produced approximately?<br>A. 10.0  B. 5.0  C. 12.0  D. 15.0  E. 20.0<br>答案：A（Chemistry）<br>[来源：validation.json id=validation_1](https://huggingface.co/datasets/yale-nlp/MMVU) |
| 2025/1/23 | Video-MMMU | NTU S-Lab；Carnegie Mellon University | [arXiv:2501.13826](https://arxiv.org/abs/2501.13826) | HF [lmms-lab/VideoMMMU](https://huggingface.co/datasets/lmms-lab/VideoMMMU)（现重定向至 lmms-eval/VideoMMMU，需同意条款，gated=auto）；GitHub [EvolvingLMMs-Lab/VideoMMMU](https://github.com/EvolvingLMMs-Lab/VideoMMMU) | video + MCQ（10 个选项；Adaptation 题附图；部分 Comprehension 题为多选或计数） | 300 个视频 / 900 条 QA（Perception、Comprehension、Adaptation 各 300），覆盖 6 个学科、30 个子学科<br>平均 506.2 s（约 8.4 min），范围 ? | GH 73<br>HF 30d 3,812 / 累计 50,190 / likes 20<br>报告：Qwen3-VL、Qwen3.5、Kimi K2.5、GLM-4.5V、MiMo-VL、Keye-VL 1.5、Seed1.8、Seed2.0 | 考察能否从专业讲解视频中获取知识：感知 → 理解 → 迁移应用三个阶段，并用 Δknowledge 衡量看完视频后的提升。 | （Science / Comprehension Track）Q: If the angle theta is changed to 30 degrees, what is the result of the first question about the total time in the air?<br>选项：4.00 / 2.82 / 3.50 / 2.50 / 3.04 / 2.00 / 3.15 / 1.85 / 2.25 / 3.85 seconds（依次为 A–J）<br>答案：E. 3.04 seconds<br>[来源：项目主页 Examples](https://videommmu.github.io/) |
| 2025/3/17 | EgoTempo（新增） | Google；Politecnico di Torino | [arXiv:2503.13646](https://arxiv.org/abs/2503.13646) | GitHub [google-research-datasets/egotempo](https://github.com/google-research-datasets/egotempo)（官方）；HF 第三方镜像 [lmms-lab-eval/egotempo](https://huggingface.co/datasets/lmms-lab-eval/egotempo) | 第一视角视频 + 开放问答（由 LLM 判分，judge 为 Gemini 1.5 Pro） | 源自 Ego4D：221 个源视频 / 365 个片段 / 500 条 QA（10 类任务，每类 50 条）<br>片段 3–140 s，平均约 45 s | GH 26<br>HF(镜像) 30d 381 / 累计 2,251 / likes 0<br>报告：Seed1.8、Seed2.0 | 在第一视角视频中考察必须整合全片信息的时序理解，包括动作与物体的顺序、计数、未来动作预测等。 | Q: How many times does the person open the fridge?<br>答案：3.（开放问答，无选项）<br>[来源：论文 Table 2](https://arxiv.org/html/2503.13646v1) |
| 2025/3/24 | Video SimpleQA（新增） | MBZUAI；淘天集团；北京大学；M-A-P；中山大学 | [arXiv:2503.18923](https://arxiv.org/abs/2503.18923) | HF [VideoSimpleQA/VideoSimpleQA](https://huggingface.co/datasets/VideoSimpleQA/VideoSimpleQA) | video + 多跳事实问答，要求短答案（按 F-score 计分，judge 为 o3） | 1,079 个视频 / 1,504 条多跳 QA（2-hop 928、3-hop 469、4-hop 107），每题附单跳子问答<br>平均 201 s，最长 8,763 s | GH 6（VideoSimpleQA/VideoSimpleQA，是否为官方 repo 未核实）<br>HF 30d 152 / 累计 1,235 / likes 2<br>报告：Seed1.8、Seed2.0 | 考察视频场景下的事实性：需要结合视频外部知识回答多跳事实问题，并给出确定的短答案。 | 多跳 Q: In which year did the capital of the country that conducted the event shown in the video in 2017 hold Kim Il Sung's funeral?<br>答案：1994<br>（子问答：event → Nuclear detonation test；country → North Korea；capital → Pyongyang）<br>[来源：HF train 第 0 行](https://huggingface.co/datasets/VideoSimpleQA/VideoSimpleQA) |
| 2025/4/10 | VCR-Bench | 中国科学技术大学；华为诺亚方舟实验室；华东师范大学 | [arXiv:2504.07956](https://arxiv.org/abs/2504.07956) | HF [VLM-Reasoning/VCR-Bench](https://huggingface.co/datasets/VLM-Reasoning/VCR-Bench)；GitHub [zhishuifeiqian/VCR-Bench](https://github.com/zhishuifeiqian/VCR-Bench) | video + MCQ（510 条）/ 开放问答（524 条），每题附逐步 CoT 标注（按 CoT score 和 accuracy 计分） | 859 个视频 / 1,034 条 QA，7 个维度<br>按时长分：短（≤1 min）418 / 中（1–5 min）293 / 长（>5 min）148<br>时长 1–3,274 s，均值 210.4 s（据 VCR-Bench.tsv 的 duration 字段计算） | GH 38<br>HF 30d 546 / 累计 3,395 / likes 6<br>报告：Seed1.8 评测表中有 "VCRBench"，但未核实它指的是本 benchmark 还是同名的 pritamqu/VCRBench（视频因果推理） | 用带"感知 / 推理"标签的逐步 CoT 标注，评估视频 CoT 推理过程的质量，而不只看最终答案。 | Q: Why didn't the Black man go to rescue the trapped woman after the explosion?<br>A. He and the woman are in a hostile relationship.<br>B. He prioritized rescuing another woman.<br>C. Another man rescued the woman.<br>D. An explosion occurred again at the scene.<br>答案：D（Video Plot Analysis）<br>[来源：VCR-Bench.tsv](https://huggingface.co/datasets/VLM-Reasoning/VCR-Bench) |
| 2025/5/1 | MINERVA | Google DeepMind；Columbia University | [arXiv:2505.00681](https://arxiv.org/abs/2505.00681) | GitHub [google-deepmind/neptune](https://github.com/google-deepmind/neptune)（README 的 MINERVA 一节，提供 minerva.json，内含 YouTube ID 和标注）；无官方 HF | video + MCQ（5 选 1）+ 人工推理轨迹 | 论文：223 个视频 / 1,515 条 QA；时长 <2 min 到 100 min（引言写"超过 1.5 h"，前后不一致），平均约 12 min<br>公开 minerva.json：1,269 条 QA / 184 个视频（据数据文件计算） | GH 100（neptune repo，与 Neptune 和 Minerva 系列共用）<br>HF ?<br>报告：Seed1.8、Seed2.0 | 考察需要组合多种技能（时序定位、计数、空间、听觉等）的复杂长视频推理，并附带可用于评估推理过程的人工轨迹。 | Q: When the narrator asks the viewer to let them know their opinion in the comments, how many cards of the heart suit are displayed in the graphics onscreen?<br>A. 1.  B. 4.  C. 0.  D. 3.  E. 6.<br>答案：B（4.）<br>[来源：minerva.json key=--mHv6CeVbg:af73a2…](https://github.com/google-deepmind/neptune#minerva) |
| 2025/5/27 | Video-Holmes | 香港城市大学；腾讯 ARC Lab（PCG） | [arXiv:2505.21374](https://arxiv.org/abs/2505.21374) | HF [TencentARC/Video-Holmes](https://huggingface.co/datasets/TencentARC/Video-Holmes)；GitHub [TencentARC/Video-Holmes](https://github.com/TencentARC/Video-Holmes) | video + MCQ（6 选 1，A–F） | 270 部悬疑短片 / 1,837 条 QA，7 类任务（SR / IMC / TCI / TA / MHR / PAR / CTI）<br>每部 1–5 min，平均时长 ? | GH 101<br>HF 30d 2,584 / 累计 18,601 / likes 17<br>报告：Seed1.8、Seed2.0 | 在悬疑短片中考察主动搜寻、整合分散线索的侦探式复杂推理。 | Q: What is the relationship between the man with a black beard and Benjamin?<br>A. neighbor  B. colleague  C. brother  D. Doctors and patients  E. stranger  F. friend<br>答案：F（Social Reasoning）<br>[来源：test_Video-Holmes.json 第 1 条](https://huggingface.co/datasets/TencentARC/Video-Holmes) |
| 2025/5/29 | VideoReasonBench | 北京大学；月之暗面（Moonshot AI）；南京大学 | [arXiv:2505.23359](https://arxiv.org/abs/2505.23359) | HF [lyx97/reasoning_videos](https://huggingface.co/datasets/lyx97/reasoning_videos)（官方 README 指向此处）；GitHub [llyx97/video_reason_bench](https://github.com/llyx97/video_reason_bench) | video + 开放问答（自由文本作答；多数题由 Qwen2.5-72B 判分，Predict Operation 一类通过模拟器校验） | 240 个视频 / 1,440 条 QA（6 种 demo 类型 × 6 项技能，分 3 个层级）<br>平均 54.3 s，最长 154.8 s；每个视频含 5–14 次操作 | GH 41<br>HF 30d 391 / 累计 6,481 / likes 7<br>报告：Seed1.8、Seed2.0 | 以视觉为中心的复杂推理：先记住细粒度操作序列，再推断隐藏的状态，最后预测视频之外的结果。 | Q（节选）: ...there are only two types of actions: adding one card to the top of the pile or removing one card from the bottom of the pile. ... What are the 1st to 3rd cards being added to any pile throughout the video? ...<br>答案："1st: Queen of Clubs, pile0 / 2nd: Ace of Hearts, pile0 / 3rd: Jack of Diamonds, pile0"（开放问答，无选项；card 类，Recall Order）<br>[来源：HF test 第 0 行](https://huggingface.co/datasets/lyx97/reasoning_videos) |

## 2. 前沿报告的覆盖情况（已核对）

- **通用的推理 / 知识类**
  - Video-MMMU：出现在 8 份报告中
  - MMVU：出现在 7 份报告中
- **只在 ByteDance Seed 系列中出现的推理 / 时序类**
  - Video-Holmes、VideoReasonBench、MINERVA、TOMATO、TVBench、EgoTempo、Video SimpleQA
  - 均同时出现在 Seed1.8 和 Seed2.0 中
- **运动类**
  - MotionBench：出现在 Kimi K2.5、GLM-4.5V、Seed1.8、Seed2.0 中
- **Grounding / 空间类**
  - Charades-STA：出现在 Qwen3-VL、MiMo-VL 中
  - VSI-Bench：出现在 Qwen3-VL 中（附录 A 的 "2D/3D Grounding and Spatial Understanding" 部分）
- **未查到**
  - Vinoground：在已核对的报告中没有出现

## 3. 未收录与存疑

- **范围外，未收录**：以下属于通用或长视频 benchmark，不属于本清单的方向
  - VideoMME、MVBench、MLVU、LVBench、LongVideoBench、CGBench、Video-MME-v2
- **只找到 1 份报告，未达收录门槛**
  - SciVideoBench、ContPhy、Morse-500、VideoSimpleQA-v2：只在 Seed2.0 中出现
  - Countix：只在 Seed1.8 中出现
- **2026 年新出的视频推理 benchmark**：VideoZeroBench（arXiv:2604.01569）、VAEX-Bench 等都没有找到 2 份以上前沿报告使用，因此未收录
- **Gemini 3 Pro 的 Video-MMMU 87.6**：只在第三方页面上看到，没有核对官方 model card，因此没有计入"报告"一栏

## Sources

- **Benchmark 论文（arXiv）**
  - https://arxiv.org/abs/1705.02101 （TALL / Charades-STA）
  - https://arxiv.org/abs/1604.01753 （Charades）
  - https://arxiv.org/abs/2403.00476 （TempCompass）
  - https://arxiv.org/abs/2410.02763 （Vinoground）
  - https://arxiv.org/abs/2410.07752 （TVBench）
  - https://arxiv.org/abs/2410.23266 （TOMATO）
  - https://arxiv.org/abs/2412.14171 （VSI-Bench）
  - https://arxiv.org/abs/2501.02955 （MotionBench）
  - https://arxiv.org/abs/2501.12380 （MMVU）
  - https://arxiv.org/abs/2501.13826 （Video-MMMU）
  - https://arxiv.org/abs/2503.13646 （EgoTempo）
  - https://arxiv.org/abs/2503.18923 （Video SimpleQA）
  - https://arxiv.org/abs/2504.07956 （VCR-Bench）
  - https://arxiv.org/abs/2505.00681 （MINERVA）
  - https://arxiv.org/abs/2505.21374 （Video-Holmes）
  - https://arxiv.org/abs/2505.23359 （VideoReasonBench）
  - arXiv HTML 全文（用于核对机构、规模和示例）：
    - https://arxiv.org/html/2403.00476
    - https://arxiv.org/html/2410.02763
    - https://arxiv.org/html/2410.07752v3
    - https://arxiv.org/html/2410.23266
    - https://arxiv.org/html/2412.14171
    - https://arxiv.org/html/2501.02955v2
    - https://arxiv.org/html/2501.12380
    - https://arxiv.org/html/2501.13826
    - https://arxiv.org/html/2503.13646v1
    - https://arxiv.org/html/2503.18923v2
    - https://arxiv.org/html/2504.07956
    - https://arxiv.org/html/2505.00681
    - https://arxiv.org/html/2505.21374
    - https://arxiv.org/html/2505.23359v2
  - arXiv 元数据：https://export.arxiv.org/api/query
- **HF 数据集（dataset card、数据文件和 API）**
  - https://huggingface.co/datasets/lmms-lab/VideoMMMU （→ lmms-eval/VideoMMMU）
  - https://huggingface.co/datasets/yale-nlp/MMVU
  - https://huggingface.co/datasets/TencentARC/Video-Holmes
  - https://huggingface.co/datasets/lyx97/reasoning_videos
  - https://huggingface.co/datasets/lmms-lab/TempCompass （→ lmms-eval/TempCompass）
  - https://huggingface.co/datasets/yale-nlp/TOMATO
  - https://huggingface.co/datasets/THUDM/MotionBench （→ zai-org/MotionBench）
  - https://huggingface.co/datasets/nyu-visionx/VSI-Bench
  - https://huggingface.co/datasets/lmms-eval/charades_sta
  - https://huggingface.co/datasets/HanSolo9682/Vinoground
  - https://huggingface.co/datasets/VLM-Reasoning/VCR-Bench
  - https://huggingface.co/datasets/pritamqu/VCRBench （同名的另一个 benchmark，仅用于消歧）
  - https://huggingface.co/datasets/FunAILab/TVBench
  - https://huggingface.co/datasets/lmms-lab-eval/egotempo
  - https://huggingface.co/datasets/VideoSimpleQA/VideoSimpleQA
  - 接口：
    - https://huggingface.co/api/datasets/{id}?expand[]=downloads&expand[]=downloadsAllTime&expand[]=likes
    - https://datasets-server.huggingface.co/rows
- **GitHub（README 和 API）**
  - https://github.com/EvolvingLMMs-Lab/VideoMMMU
  - https://github.com/yale-nlp/MMVU
  - https://github.com/TencentARC/Video-Holmes
  - https://github.com/llyx97/video_reason_bench
  - https://github.com/google-deepmind/neptune
  - https://github.com/llyx97/TempCompass
  - https://github.com/yale-nlp/TOMATO
  - https://github.com/zai-org/MotionBench
  - https://github.com/vision-x-nyu/thinking-in-space
  - https://github.com/jiyanggao/TALL
  - https://github.com/Vinoground/Vinoground
  - https://github.com/zhishuifeiqian/VCR-Bench
  - https://github.com/daniel-cores/tvbench
  - https://github.com/google-research-datasets/egotempo
  - https://github.com/VideoSimpleQA/VideoSimpleQA
  - 接口：https://api.github.com/repos/{owner}/{repo}
- **其他一手数据和主页**
  - https://videommmu.github.io/ （Video-MMMU 示例）
  - https://storage.googleapis.com/neptunedata/minerva.json （MINERVA 公开标注）
- **前沿模型技术报告 / model card（用于"报告"一栏）**
  - Qwen3-VL Technical Report：https://arxiv.org/html/2511.21631
  - Qwen3.5 model card：https://huggingface.co/Qwen/Qwen3.5-397B-A17B
  - Kimi K2.5 model card：https://huggingface.co/moonshotai/Kimi-K2.5
  - Seed2.0 官方页：https://seed.bytedance.com/en/seed2
  - Seed2.0 Model Card：https://arxiv.org/abs/2607.00248
  - Seed1.8 Model Card：https://arxiv.org/html/2603.20633v2
  - GLM-4.1V-Thinking / GLM-4.5V：https://arxiv.org/html/2507.01006
  - MiMo-VL：https://arxiv.org/html/2506.03569
  - Kwai Keye-VL 1.5：https://arxiv.org/html/2509.01563
  - GLM-V README（GLM-4.6V 的评测表是图片，未读取）：https://github.com/zai-org/GLM-V

