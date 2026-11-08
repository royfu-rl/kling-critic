# 通用 / 长视频 QA Benchmark 清单（Inventory）

- 范围：通用视频理解 + 长视频问答类 benchmark（知识 / 推理 / 时序 / 空间 / 定位 / 流式等另见同目录其他清单）
- 检查日期：2026-11-08
- 口径
  - 发布日期 = arXiv v1 提交日期（UTC），取自 arXiv API `published` 字段
  - GH★ = GitHub API `stargazers_count`
  - HF 下载 = HF API `downloads`（近 30 天） / `downloadsAllTime`（累计）；标「镜像」的是 lmms-eval（原 lmms-lab，现自动重定向）托管的评测镜像，非官方
  - 前沿覆盖 = 在下列 17 个 2025–2026 前沿模型报告 / 模型卡正文（去掉参考文献）中出现的份数
    - Qwen2.5-VL、Qwen3-VL、Qwen3-Omni、Qwen3.5、Qwen3.6、InternVL3、InternVL3.5、Seed1.5-VL、Seed1.8、Seed2.0、Kimi-VL、Kimi-K2.5、GLM-4.5V、MiMo-VL、Keye-VL-1.5、Gemini-2.5、Eagle-2.5
    - 统计的是"被提及"，不完全等于"出现在结果表"
- 「?」= 未能从一手来源核实

## 1. 总表（按发布日期排序）

| 发布日期 | 名称 | 机构 | Paper | Download | 形态 | 规模 | 影响力 | 考察能力 | Example |
|---|---|---|---|---|---|---|---|---|---|
| 2019/6/6 | ActivityNet-QA | 杭州电子科技大学、浙江大学、UBTECH Sydney AI Centre（悉尼大学） | [arXiv 1906.02467](https://arxiv.org/abs/1906.02467)（AAAI 2019） | GH [MILVLG/activitynet-qa](https://github.com/MILVLG/activitynet-qa)（仅标注，视频需从 ActivityNet 官方取）；HF 镜像 [lmms-lab/ActivityNetQA](https://huggingface.co/datasets/lmms-lab/ActivityNetQA) | video → 开放式短答 | 5,800 视频 / 58,000 QA；平均 180s；测试集 8,000 QA（镜像 test 行数） | GH★94；HF 镜像 30d 3,253 / 累计 59,714；前沿覆盖 1/17（Gemini-2.5） | 对约 3 分钟的网络活动视频做开放式短答，考察动作、时序、属性等基础理解 | Q: what happened to the person in white after he blew his hair<br>A: tie up hair<br>（[HF viewer, test row 4001](https://datasets-server.huggingface.co/rows?dataset=lmms-eval/ActivityNetQA&config=default&split=test&offset=4000&length=60)） |
| 2021/5/18 | NExT-QA | 新加坡国立大学（NUS） | [arXiv 2105.08276](https://arxiv.org/abs/2105.08276)（CVPR 2021） | GH [doc-doc/NExT-QA](https://github.com/doc-doc/NExT-QA)；HF 镜像 [lmms-lab/NExTQA](https://huggingface.co/datasets/lmms-lab/NExTQA) | video + MCQ（5 选）/ 开放式 QA | 5,440 视频；MC 47,692 QA（test 8,564）、OE 52,044 QA；平均约 44s（取自 CG-Bench 论文对比表，原文未直接核到） | GH★194；HF 镜像 30d 9,063 / 累计 109,260；前沿覆盖 1/17（Eagle-2.5） | 日常短视频中的因果、时序动作推理和场景描述（"为什么 / 之后发生了什么"） | Q: what did the baby do after throwing the green cup away while on the floor near the end<br>A. clap proudly B. the lady sitting down C. lay on floor D. just picked it up E. crawl<br>答案：C<br>（[HF viewer, MC/test](https://datasets-server.huggingface.co/rows?dataset=lmms-eval/NExTQA&config=MC&split=test&offset=0&length=3)） |
| 2023/5/23 | Perception Test | DeepMind（另有 Univ. of Bristol、Univ. of Oxford） | [arXiv 2305.13786](https://arxiv.org/abs/2305.13786)（NeurIPS 2023 D&B） | GH [google-deepmind/perception_test](https://github.com/google-deepmind/perception_test)（Google Storage 直链）；HF 镜像 [lmms-lab/PerceptionTest_Val](https://huggingface.co/datasets/lmms-lab/PerceptionTest_Val) | video(+audio) + MCQ（3 选）；另含 grounded QA、跟踪、动作 / 声音定位等非语言任务 | 11.6k 视频，平均 23s；38K mc-vQA + 6K g-vQA（v1 数字）；val mc 题 19,140（镜像行数） | GH★265；HF 镜像 30d 7,537 / 累计 55,186；前沿覆盖 3/17 | 诊断式评测，覆盖记忆、抽象、物理、语义四类技能，以及描述、解释、预测、反事实四类推理 | Q: Where is the person?<br>A. Indoors in the kitchen B. Outdoors C. Indoors in the living room or bedroom<br>答案：C（answer_id=2）<br>（[HF viewer, val](https://datasets-server.huggingface.co/rows?dataset=lmms-eval/PerceptionTest_Val&config=mc_question_val&split=validation&offset=0&length=3)） |
| 2023/8/17 | EgoSchema | UC Berkeley | [arXiv 2308.09126](https://arxiv.org/abs/2308.09126) | GH [egoschema/EgoSchema](https://github.com/egoschema/EgoSchema)（Kaggle / Drive）；HF 镜像 [lmms-lab/egoschema](https://huggingface.co/datasets/lmms-lab/egoschema) | 第一视角 video（3 min）+ MCQ（5 选） | 5,000+ QA（公开题 5,031，其中 500 题 Subset 公开答案）；每题一个 3 分钟片段，共 250+ 小时；源自 Ego4D | GH★123；HF 镜像 30d 11,459 / 累计 207,425；前沿覆盖 4/17 | 第一视角 3 分钟视频的长时程整体理解，要求跨片段归纳行为和意图 | Q: What was the primary purpose of the cup of water in this video, and how did it contribute to the overall painting process?<br>A. To provide a source of water for the paintbrush. B. To provide a place to store the paintbrush. C. To provide a place to dispose of the paintbrush. D. To provide a place to rest the paintbrush. E. To clean the paintbrush.<br>答案：E（answer=4）<br>（[HF viewer, Subset](https://datasets-server.huggingface.co/rows?dataset=lmms-eval/egoschema&config=Subset&split=test&offset=0&length=3)） |
| 2023/11/28 | MVBench | 中科院深圳先进院、中国科学院大学、上海 AI Lab、港大、复旦、南京大学 | [arXiv 2311.17005](https://arxiv.org/abs/2311.17005)（CVPR 2024） | HF [OpenGVLab/MVBench](https://huggingface.co/datasets/OpenGVLab/MVBench)；GH [OpenGVLab/Ask-Anything](https://github.com/OpenGVLab/Ask-Anything) | video + MCQ | 20 个时序任务 × 200 题 = 4,000 QA，由 11 个公开视频数据集自动转换；视频数 / 时长原文未直接给出（CG-Bench 对比表引为 3,641 视频、平均 16s，?） | HF 30d 52,108 / 累计 716,915；GH★3,364（整个 VideoChat 仓库，不只 MVBench）；前沿覆盖 10/17 | 20 个"单帧答不了"的短视频时序任务，包括动作序列、物体交互、位置、计数、场景变化等 | Q: What happened after the person took the food?<br>候选: Ate the medicine. / Tidied up the blanket. / Put down the cup/glass/bottle. / Took the box.<br>答案：Ate the medicine.<br>（[HF viewer, action_sequence](https://datasets-server.huggingface.co/rows?dataset=OpenGVLab/MVBench&config=action_sequence&split=train&offset=0&length=1)） |
| 2024/5/31 | Video-MME | 中科大、厦大、港大、北大、港中文、华东师大（v1 署名） | [arXiv 2405.21075](https://arxiv.org/abs/2405.21075) | HF [lmms-lab/Video-MME](https://huggingface.co/datasets/lmms-lab/Video-MME)（官方 README 指向，现重定向到 lmms-eval/Video-MME）；GH [MME-Benchmarks/Video-MME](https://github.com/MME-Benchmarks/Video-MME) | video(+字幕 / 音频) + MCQ（4 选） | 900 视频 / 2,700 QA；时长 11s–1h，分短（<2min）、中（4–15min）、长（30–60min）三档；平均 1,024s；共 256h（v1 摘要） | GH★802；HF 30d 69,776 / 累计 1,121,892；前沿覆盖 17/17 | 全谱综合评测：6 个领域 30 个子类、三档时长，在帧、字幕、音频输入下考察感知、推理和信息汇总 | Q: How many red socks are above the fireplace at the end of this video?<br>A. 1. B. 4. C. 2. D. 3.<br>答案：D<br>（[HF viewer](https://datasets-server.huggingface.co/rows?dataset=lmms-eval/Video-MME&config=videomme&split=test&offset=0&length=3)） |
| 2024/6/6 | MLVU | 北京智源研究院（BAAI）、北大、北邮、浙大 | [arXiv 2406.04264](https://arxiv.org/abs/2406.04264)（CVPR 2025） | HF [MLVU/MVLU](https://huggingface.co/datasets/MLVU/MVLU)（Dev，gated）/ [MLVU/MLVU_Test](https://huggingface.co/datasets/MLVU/MLVU_Test)；GH [JUNJIE99/MLVU](https://github.com/JUNJIE99/MLVU) | video + MCQ（Dev 4 选，Test 6 选）+ 开放式生成（摘要、子场景描述） | 1,730 视频 / 3,102 QA（Dev 2,593 + Test 509，v3 数字）；时长 3min–2h，平均约 12min（v3 表为 930s） | GH★268；HF(Dev) 30d 23,112 / 累计 330,526；前沿覆盖 10/17 | 长视频多任务，分整体（主题、摘要）、单细节（needle、plotQA）、多细节（计数、排序）三类 | Q: How did the cartoon jellyfish leave the mire?<br>候选: Carried by the cartoon shrimp / … turtle / … catfish / … seahorse<br>答案：Carried by the cartoon turtle<br>（[GH data/1_plotQA.json](https://github.com/JUNJIE99/MLVU/blob/main/data/1_plotQA.json)） |
| 2024/6/12 | LVBench | 智谱 AI、清华大学（另有北大实习生） | [arXiv 2406.08035](https://arxiv.org/abs/2406.08035) | HF [zai-org/LVBench](https://huggingface.co/datasets/zai-org/LVBench)（原 THUDM/LVBench）；GH [zai-org/LVBench](https://github.com/zai-org/LVBench) | video + MCQ（4 选），每题附 time_reference | 103 视频 / 1,549 QA；平均 4,101s（约 68min）；按官方 meta 算得 30.1–139.9min | GH★157；HF 官方 30d 3,068 / 累计 25,022；HF 镜像(lmms-eval) 30d 11,393 / 累计 70,605；前沿覆盖 12/17 | 小时级超长视频上的关键信息检索、事件理解、实体识别、时间定位、推理和总结 | Q: What year appears in the opening caption of the video?<br>(A) 1636 (B) 1366 (C) 1363 (D) 1633<br>答案：D（time_reference 00:15-00:19）<br>（[HF video_info.meta.jsonl](https://huggingface.co/datasets/zai-org/LVBench/blob/main/video_info.meta.jsonl)） |
| 2024/6/20 | MMBench-Video | 上海 AI Lab、上海交大、港中文、同济 | [arXiv 2406.14515](https://arxiv.org/abs/2406.14515)（NeurIPS 2024 D&B） | HF [opencompass/MMBench-Video](https://huggingface.co/datasets/opencompass/MMBench-Video)；评测代码在 GH [open-compass/VLMEvalKit](https://github.com/open-compass/VLMEvalKit) | video → 开放式 QA（GPT-4 按 0–3 打分） | 609 视频片段 / 1,998 QA；时长 30s–6min，平均 165s，共 28h；16 大类视频，26 项细粒度能力 | HF 30d 1,441 / 累计 63,893；无独立 GH 仓库（VLMEvalKit ★4,475 为整个工具箱）；前沿覆盖 3/17 | 多镜头 YouTube 视频的开放式问答，按能力体系打分，侧重时序理解 | Q: Did the mint-style guy in the video drink his mouthwash?<br>A: Yes, he drank it. This is very strange. Under normal circumstances we are not allowed to drink mouthwash, but this boy may be doing it to attract viewers.<br>（维度：Counterfactual Reasoning；[HF dataset card](https://huggingface.co/datasets/opencompass/MMBench-Video)） |
| 2024/7/22 | LongVideoBench | ?（论文和项目页未列单位；项目页投稿邮箱为 rhymes.ai，推测为 Rhymes AI） | [arXiv 2407.15754](https://arxiv.org/abs/2407.15754)（NeurIPS 2024 D&B） | HF [longvideobench/LongVideoBench](https://huggingface.co/datasets/longvideobench/LongVideoBench)（gated）；GH [longvideobench/LongVideoBench](https://github.com/longvideobench/LongVideoBench) | video + 交错字幕 + MCQ（4–5 选） | 3,763 视频 / 6,678 MCQ（val 752 视频 / 1,337 题；test 3,011 视频 / 5,341 题）；4 档时长 8–15s、15–60s、3–10min、15–60min；平均 473s | GH★140；HF 30d 21,715 / 累计 313,382；前沿覆盖 10/17 | "指代式推理"：先按问题描述的场景或字幕找到长视频中的片段，再回答细节，考察长上下文检索和推理 | Q: In front of an ancient building, a woman walks by holding something. When the subtitle says 'temples scattered throughout the', what color is the woman's clothing at that moment?<br>A. yellow B. green C. blue D. red<br>答案：A（correct_choice=0）<br>（[HF viewer, LongVideoBench-Meta/validation](https://datasets-server.huggingface.co/rows?dataset=longvideobench/LongVideoBench-Meta&config=default&split=validation&offset=0&length=3)） |
| 2024/11/7 | HourVideo | Stanford University | [arXiv 2411.04998](https://arxiv.org/abs/2411.04998)（NeurIPS 2024 D&B） | HF [HourVideo/HourVideo](https://huggingface.co/datasets/HourVideo/HourVideo)（gated）；GH [keshik6/HourVideo](https://github.com/keshik6/HourVideo) | 第一视角 video + MCQ（5 选） | 500 视频（Ego4D）/ 12,976 MCQ；时长 20–120min，平均 45.7min；dev 集 50 视频 / 1,182 题（README） | GH★146；HF 30d 489 / 累计 8,471；前沿覆盖 1/17（Eagle-2.5） | 小时级第一视角视频的摘要、感知（回忆、跟踪）、视觉推理（空间、时间、预测、因果、反事实）和导航 | Q: After shopping and interacting with the Cashier at the checkout, what will the camera wearer do next?<br>A) …hands over the trolley to a woman, then cycle back home. B) …buys a drink at the exit, then run towards the bus stand. C) …hands over the trolley to a man, then walk towards the bus stop. D) Looks at their phone while pushing a trolley, exits the store, hands over the trolley to Woman, then run towards the bus stand. E) …exits the store, buys a drink at the exit, then run towards the bus stand.<br>答案：D（图中下划线标注）<br>（[arXiv 2411.04998 Fig.1, Predictive](https://arxiv.org/pdf/2411.04998v1)） |
| 2024/12/16 | CG-Bench | 南京大学、上海 AI Lab、复旦、浙大 | [arXiv 2412.12075](https://arxiv.org/abs/2412.12075)（ICLR 2025） | HF [CG-Bench/CG-Bench](https://huggingface.co/datasets/CG-Bench/CG-Bench)（gated）；GH [CG-Bench/CG-Bench](https://github.com/CG-Bench/CG-Bench) | video(+字幕 / 音频) + MCQ（最多 8 选）/ 开放式 QA / 线索时间段（timestamp grounding） | 1,219 视频 / 12,129 QA；时长 10–80min，平均 1,624.4s（约 27min）；14 / 171 / 638 三级分类；共 14,362 个线索区间，平均 19.24s | GH★22；HF 30d 16,568 / 累计 78,103；前沿覆盖 4/17 | 长视频问答，同时要求给出线索时间段，检验答案是否来自正确证据，而不是靠排除法猜对 | Q: When the protagonist in the video bought blueberries, what color was the shared bicycle on the left hand side of the blueberry stall owner?<br>A. aqua B. mint C. jade D. cyan E. green F. blue G. turquoise H. teal<br>答案：F（clue_intervals [[4,12]]）<br>（[GH cgbench_mini.json](https://github.com/CG-Bench/CG-Bench/blob/main/cgbench_mini.json)） |
| 2025/5/1 | MINERVA（补充项，偏推理；亦见 inventory_reasoning_temporal.md） | Google DeepMind、Columbia University | [arXiv 2505.00681](https://arxiv.org/abs/2505.00681) | 无 HF；GH [google-deepmind/neptune](https://github.com/google-deepmind/neptune#minerva)（JSON 放在 Google Storage） | video(+字幕) + MCQ（5 选）+ 人工推理链 | 223 视频 / 1,515 题；视频不到 2min 至 100min，平均 12min；每个视频 1–10 题（平均 6.8） | GH★100（与 Neptune 共用仓库）；前沿覆盖 3/17（Gemini-2.5、Seed1.8、Seed2.0） | 多步复杂视频推理，每题至少需要两项技能（如计数 + 时间定位），附推理链，可以评推理过程 | Q: How many times does the ball change hands on the play that results in Pampanga having 52 points on the scoreboard?<br>(a) 5 (b) 3 (c) 4 (d) 2 (e) 1<br>答案：(b)（推理链结论为 three）<br>（[arXiv 2505.00681 Fig.1](https://arxiv.org/pdf/2505.00681v1)） |
| 2026/4/6 | Video-MME-v2（Video-MME 2） | Video-MME Team（论文和 README 均未列单位，?） | [arXiv 2604.05015](https://arxiv.org/abs/2604.05015) | HF [MME-Benchmarks/Video-MME-v2](https://huggingface.co/datasets/MME-Benchmarks/Video-MME-v2)；GH [MME-Benchmarks/Video-MME-v2](https://github.com/MME-Benchmarks/Video-MME-v2) | video(+音频 / 词级字幕) + 4 题一组的 MCQ（8 选），按组做非线性计分 | 800 视频 / 3,200 QA；平均 10.4min，99% ≤20min，53% ≤10min；80% 以上视频发布于 2025 年及以后；4 大类 31 子类；3,300 人时标注 | GH★368；HF 30d 12,999 / 累计 70,532（likes 52）；前沿覆盖 0/17（所扫报告多数早于其发布；论文自测了 Gemini-3-Pro、GPT-5、Seed-2.0、Qwen3.5、Kimi-K2.5 等） | 三层递进（信息聚合 → 时序动态 → 复杂推理），组内要求一致、连贯，非线性计分抑制蒙对；发布时 Gemini-3-Pro 49.4，人类 90.7 | Q: What is the order of the first two competitions?<br>A. Deadlift, arm wrestling. B. Arm wrestling, deadlift. C. Punch strength, arm wrestling. D. Arm wrestling, punch strength. E. Punch strength, deadlift. F. Deadlift, punch strength. G. Push-ups, arm wrestling. H. Push-ups, punch strength.<br>答案：B<br>（[项目页 Examples, Level 2](https://video-mme-v2.netlify.app/)） |

## 2. 收录说明

- 用户点名的 13 个已全部收录
- 补充收录：MINERVA
  - 依据：前沿覆盖 3/17（Gemini-2.5 结果表 visual+subtitles 栏、Seed1.8 和 Seed2.0 视频表）
  - 视频较长（最长 100min），但各报告都把它归入 Reasoning，属于边界项
- 前沿覆盖 ≥2 但不属于通用 / 长视频 QA，未收录（另见其他清单）
  - 知识：VideoMMMU 13、MMVU 9、VideoSimpleQA 2
  - 时序 / 运动：TempCompass 5、MotionBench 5、TOMATO 4、EgoTempo 3
  - 空间 / 定位：VSI-Bench 4、Charades-STA 4
  - 推理：Video-Holmes 3、VideoReasonBench 2
  - 流式：OVO-Bench 3
- 长视频类但前沿覆盖仅 1/17，未收录
  - Neptune（Gemini-2.5）
  - 1H-VideoQA（Gemini-2.5，内部集，未公开）
  - VideoEval-Pro（Seed2.0 "Long Video" 栏）
- 需要注意的数字口径
  - 多个数据集的论文 v1 和后续版本数字不一致（如 Video-MME 256h，MLVU v1 2,593 题 vs v3 3,102 题）；表中已逐项注明版本
  - HF 上 `lmms-lab/*` 各仓库（含 Video-MME 官方指向的仓库）已重定向到 `lmms-eval/*`，下载量按重定向后的仓库统计

## Sources

- 论文（arXiv）
  - https://arxiv.org/abs/1906.02467
  - https://arxiv.org/abs/2105.08276
  - https://arxiv.org/abs/2305.13786
  - https://arxiv.org/abs/2308.09126
  - https://arxiv.org/abs/2311.17005
  - https://arxiv.org/abs/2405.21075
  - https://arxiv.org/abs/2406.04264 （另读 https://arxiv.org/pdf/2406.04264v3）
  - https://arxiv.org/abs/2406.08035
  - https://arxiv.org/abs/2406.14515
  - https://arxiv.org/abs/2407.15754
  - https://arxiv.org/abs/2411.04998
  - https://arxiv.org/abs/2412.12075
  - https://arxiv.org/abs/2505.00681
  - https://arxiv.org/abs/2604.05015 ， https://arxiv.org/html/2604.05015v1
  - v1 日期查询：https://export.arxiv.org/api/query?id_list=2405.21075,2311.17005,2406.04264,2407.15754,2406.08035,2308.09126,2305.13786,2105.08276,1906.02467,2406.14515,2411.04998,2412.12075,2604.05015
- 项目页 / README
  - https://video-mme-v2.netlify.app/
  - https://longvideobench.github.io/
  - https://github.com/MME-Benchmarks/Video-MME
  - https://github.com/MME-Benchmarks/Video-MME-v2
  - https://github.com/OpenGVLab/Ask-Anything
  - https://github.com/JUNJIE99/MLVU ， https://github.com/JUNJIE99/MLVU/blob/main/data/1_plotQA.json
  - https://github.com/longvideobench/LongVideoBench
  - https://github.com/zai-org/LVBench
  - https://github.com/egoschema/EgoSchema
  - https://github.com/google-deepmind/perception_test
  - https://github.com/doc-doc/NExT-QA
  - https://github.com/MILVLG/activitynet-qa
  - https://github.com/open-compass/VLMEvalKit
  - https://github.com/keshik6/HourVideo
  - https://github.com/CG-Bench/CG-Bench ， https://github.com/CG-Bench/CG-Bench/blob/main/cgbench_mini.json
  - https://github.com/google-deepmind/neptune
- HF 数据集页 / 文件 / viewer
  - https://huggingface.co/datasets/lmms-lab/Video-MME （→ lmms-eval/Video-MME）
  - https://huggingface.co/datasets/MME-Benchmarks/Video-MME-v2
  - https://huggingface.co/datasets/OpenGVLab/MVBench
  - https://huggingface.co/datasets/MLVU/MVLU ， https://huggingface.co/datasets/MLVU/MLVU_Test
  - https://huggingface.co/datasets/longvideobench/LongVideoBench ， https://huggingface.co/datasets/longvideobench/LongVideoBench-Meta
  - https://huggingface.co/datasets/zai-org/LVBench ， https://huggingface.co/datasets/zai-org/LVBench/blob/main/video_info.meta.jsonl ， https://huggingface.co/datasets/lmms-lab/LVBench
  - https://huggingface.co/datasets/lmms-lab/egoschema
  - https://huggingface.co/datasets/lmms-lab/PerceptionTest_Val
  - https://huggingface.co/datasets/lmms-lab/NExTQA
  - https://huggingface.co/datasets/lmms-lab/ActivityNetQA
  - https://huggingface.co/datasets/opencompass/MMBench-Video （README + MMBench-Video.tsv）
  - https://huggingface.co/datasets/HourVideo/HourVideo
  - https://huggingface.co/datasets/CG-Bench/CG-Bench
  - viewer API：https://datasets-server.huggingface.co/rows?dataset=lmms-eval/Video-MME&config=videomme&split=test&offset=0&length=3
  - viewer API：https://datasets-server.huggingface.co/first-rows?dataset=MME-Benchmarks/Video-MME-v2&config=default&split=test
  - viewer API：https://datasets-server.huggingface.co/rows?dataset=OpenGVLab/MVBench&config=action_sequence&split=train&offset=0&length=1
  - viewer API：https://datasets-server.huggingface.co/rows?dataset=lmms-eval/egoschema&config=Subset&split=test&offset=0&length=3
  - viewer API：https://datasets-server.huggingface.co/rows?dataset=lmms-eval/PerceptionTest_Val&config=mc_question_val&split=validation&offset=0&length=3
  - viewer API：https://datasets-server.huggingface.co/rows?dataset=lmms-eval/NExTQA&config=MC&split=test&offset=0&length=3
  - viewer API：https://datasets-server.huggingface.co/rows?dataset=lmms-eval/ActivityNetQA&config=default&split=test&offset=4000&length=60
  - viewer API：https://datasets-server.huggingface.co/rows?dataset=longvideobench/LongVideoBench-Meta&config=default&split=validation&offset=0&length=3
- 影响力数据（2026-11-08 抓取）
  - GitHub：`https://api.github.com/repos/<owner>/<repo>`（上述各仓库）
  - HF：`https://huggingface.co/api/datasets/<id>?expand[]=downloads&expand[]=downloadsAllTime&expand[]=likes`（上述各数据集）
- 前沿模型报告 / 模型卡（前沿覆盖统计用）
  - Qwen2.5-VL：https://arxiv.org/abs/2502.13923
  - Qwen3-VL：https://arxiv.org/abs/2511.21631 ， https://huggingface.co/Qwen/Qwen3-VL-235B-A22B-Instruct
  - Qwen3-Omni：https://arxiv.org/abs/2509.17765
  - Qwen3.5：https://huggingface.co/Qwen/Qwen3.5-397B-A17B
  - Qwen3.6：https://huggingface.co/Qwen/Qwen3.6-35B-A3B
  - InternVL3：https://arxiv.org/abs/2504.10479
  - InternVL3.5：https://arxiv.org/abs/2508.18265
  - Seed1.5-VL：https://arxiv.org/abs/2505.07062
  - Seed1.8：https://arxiv.org/abs/2603.20633
  - Seed2.0：https://arxiv.org/abs/2607.00248
  - Kimi-VL：https://arxiv.org/abs/2504.07491
  - Kimi-K2.5：https://arxiv.org/abs/2602.02276 ， https://huggingface.co/moonshotai/Kimi-K2.5
  - GLM-4.5V：https://arxiv.org/abs/2507.01006
  - MiMo-VL：https://arxiv.org/abs/2506.03569
  - Keye-VL-1.5：https://arxiv.org/abs/2509.01563
  - Gemini 2.5：https://arxiv.org/abs/2507.06261
  - Eagle 2.5：https://arxiv.org/abs/2504.15271

