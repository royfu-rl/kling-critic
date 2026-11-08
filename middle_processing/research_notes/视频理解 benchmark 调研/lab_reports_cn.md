# 中国厂商前沿模型：自报视频理解 Benchmark 调研

> 截至 2026-11-08 · 只收**厂商自己发布**的分数（官方博客 / 模型卡 / 技术报告）
> 起点快照：`/mmu_mllm_hdd_4/deep-research/kim-leaderboard/output/leaderboard.html`（2026-11-03 导出）；快照内的每个数都重新对过官方来源，结果见第 3 节

## 0. 读表须知

- **口径**
  - 分数按官方原样照抄，不换算
  - 同一 benchmark 不同厂商的设置差异很大（字幕、帧数、是否带工具或记忆），**跨厂商不能直接比**，请先看「设置/备注」列
  - Video-MME 的字幕设置
    - 带字幕：Qwen3.8-Max、Kimi K3、Seed（‡）、InternVL3.5（另报无字幕分）
    - 不带字幕：Keye
    - 未说明：MiMo
- **来源类型**：Blog（含官网模型页）/ Model card / Tech report / `leaderboard snapshot only`（官方来源里找不到，只有本地快照有）
- **自建?**
  - `Y`：厂商自建
  - `疑似`：没有公开出处、也没有明说是自建
  - `N`：公开 benchmark
- **来源 URL**：表中写的是短编号（如 `[Q1]`），可以点击，完整 URL 在第 4 节

---

## 1. 分数总表（按 benchmark 分组）

### 1.1 综合视频理解

| Benchmark | 模型 | 分数 | 设置/备注 | 来源类型 | 来源 URL | 自建? |
|---|---|---|---|---|---|---|
| Video-MME | Qwen3.8-Max | 90.4 | w/ Sub. | Blog | [Q1] | N |
| Video-MME | Kimi K3 | 90.0 | w. sub；reasoning effort max，temp 1.0，top-p 0.95，3 次平均；帧数未说明 | Model card / Tech report | [K1] [K2] | N |
| Video-MME | Seed2.0 Pro | 89.5 | ‡ = 带字幕 | Model card / Blog | [S5] [S4] [S6] | N |
| Video-MME | Seed2.1 Pro | 89.2 | ‡（2.1 模型卡没定义 ‡，沿用 2.0 的口径应为带字幕） | Model card / Blog | [S2] [S1] [S3] | N |
| Video-MME | Seed2.1 Turbo | 89.0 | 同上；官网页印作 "89" | Model card | [S2] [S1] | N |
| Video-MME | MiMo-V2.5 | 87.7 | 字幕、帧数、thinking 均未说明（BenchLM 标的 "with subtitle" 官方没有写） | Blog / Model card（图表） | [M1] [M2] | N |
| Video-MME | Keye-VL-671B-A37B | 79.0 | thinking；字幕未说明；数字从模型卡图片读出 | Model card | [Y3] | N |
| Video-MME | Keye-VL-2.0-30B-A3B | 78.3 | w/o sub.；帧数未说明 | Tech report | [Y1] | N |
| Video-MME | InternVL3.5-241B-A28B | 72.9 / 76.0 | w/o sub / w sub；在 16/32/48/64 帧中取最高 | Tech report | [I1] | N |
| Video-MME v2 | Qwen3.8-Max | 68.3 | w/ Sub. | Blog | [Q1] | N |
| Video-MME v2 | Qwen3.8-Omni-Flash | 65.0 / 71.3 | 归在音视频推理类；Static / Qwen Code（agentic） | Blog / Tech report | [Q2] [Q3] | N |
| Video-MME v2 | Seed2.0 Pro | 60.5* | 只出现在官网模型页；星号页面没有解释 | Blog（官网模型页） | [S4] | N |
| Video-MME v2 | dots3-note Preview | 39.26 | 开启音频输入；模型卡印作 39.3 | Blog / Model card | [D1] [D2] | N |
| Video-MME v2 | Keye-VL-2.0-30B-A3B | ACC 35.3 / 42.4；Non-Lin 18.5 / 24.2 | 64 / 512 帧 | Tech report / Model card | [Y1] [Y2] | N |
| Video-MME v2 | Qwen3.8-Flash | 71.00 | **官方来源未找到**（见第 3 节） | leaderboard snapshot only | [L0] | N |
| VideoMMMU | Qwen3.8-Max | 88.7 | — | Blog | [Q1] | N |
| VideoMMMU | Seed2.0 Pro | 86.9 | — | Model card / Blog | [S5] [S6] | N |
| VideoMMMU | dots3-note Preview | 86.78 | 用 GPT-OSS 抽取选项；模型卡印作 86.8 | Blog / Model card | [D1] [D2] | N |
| VideoMMMU | Keye-VL-2.0-30B-A3B | 80.0 | 官方值；快照写的 80.90 不对 | Tech report | [Y1] | N |
| MMVU | Keye-VL-671B-A37B | 86.6 | thinking | Model card | [Y3] | N |
| MMVU | Qwen3.8-Max | 82.4 | — | Blog | [Q1] | N |
| MMVU | Kimi K3 | 82.1 | 设置同 Video-MME 那一行 | Model card / Tech report | [K1] [K2] | N |
| MMVU | GLM-5.3-Flash | 80.5 | temp 1.0，top_p 0.95，256K 上下文，reasoning effort 默认 max | Blog | [Z1] | N |
| MMVU | dots3-note Preview | 79.9 | 用 GPT-OSS 抽取选项 | Blog / Model card | [D1] [D2] | N |
| MMVU | Seed2.0 Pro | 78.2 | — | Model card / Blog | [S5] [S6] | N |
| MMVU | Keye-VL-2.0-30B-A3B | 69.60 | **官方来源未找到**（技术报告 Table 2 没有 MMVU） | leaderboard snapshot only | [L0] | N |
| MVBench | GLM-5.3-Flash | 77.8 | 设置同 MMVU 那一行 | Blog | [Z1] | N |
| MVBench | InternVL3.5-241B-A28B | 76.5 | 16 帧 | Tech report | [I1] | N |
| MVBench | GLM-5V-Turbo | "+5.6%" | 只给了 RL 相对 SFT 的增益，**没有绝对分** | Tech report | [Z2] | N |
| MMBench-Video | InternVL3.5-241B-A28B | 1.74 | 0–3 分制；在 16–64 帧中取最高 | Tech report | [I1] | N |
| TempCompass | Seed2.0 Pro | 89.6 | 2 FPS | Model card / Blog | [S5] [S6] | N |
| TempCompass | Keye-VL-671B-A37B | 77.8 | thinking | Model card | [Y3] | N |
| VideoSimpleQA | Seed2.1 Pro | 76.4 | 模型卡正文写的是 75.5，表格和官网页都是 76.4 | Model card / Blog | [S2] [S1] | N |
| VideoSimpleQA | Seed2.1 Turbo | 71.4 | — | Model card | [S2] | N |
| VideoSimpleQA | Seed2.0 Pro | 71.9 | — | Model card / Blog | [S5] [S6] | N |
| VideoSimpleQA-v2 | Seed2.0 Pro | 71.5 | 只出现在官网模型页，没有引用 | Blog（官网模型页） | [S4] | 疑似 |
| SciVideo | Seed2.0 Pro | 52.3 | 只出现在官网模型页，没有引用 | Blog（官网模型页） | [S4] | 疑似 |

### 1.2 长视频

| Benchmark | 模型 | 分数 | 设置/备注 | 来源类型 | 来源 URL | 自建? |
|---|---|---|---|---|---|---|
| LVBench | Qwen3.8-Max | 81.8 / 85.6 | 标准 / w/ Mem.（用 Qwen-MM-Plugins 搭的视频记忆系统） | Blog | [Q1] | N |
| LVBench | Seed2.0 Pro | 76.4 / 80.0 | 不用工具 / 用 VideoCut 工具 | Model card（Table 9 / 10） | [S5] | N |
| LVBench | Seed2.1 Pro | 78.0 | 博客图表印作 "78" | Model card / Blog | [S2] [S3] | N |
| LVBench | Seed2.1 Turbo | 76.8 | — | Model card | [S2] | N |
| LVBench | Qwen3.8-Omni-Flash | 76.9 | 默认设置 | Blog / Tech report | [Q2] [Q3] | N |
| LVBench | Qwen3.8-Flash | 76.6 | 开源版名为 Qwen3.8-Flash-Next，Qwen3.8-Flash 是它的生产版；Omni 报告的表头直接写 "Qwen3.8-Flash" | Blog / Model card / Tech report | [Q4] [Q5] [Q3] | N |
| LVBench | Qwen3.8-27B | 72.4 | — | Blog | [Q4] [Q2] | N |
| LVBench | Keye-VL-2.0-30B-A3B | 60.90 | **官方来源未找到**（技术报告 Table 2 没有 LVBench） | leaderboard snapshot only | [L0] | N |
| MLVU | Qwen3.8-Max | 90.8 | M-Avg | Blog | [Q1] | N |
| MLVU | Keye-VL-2.0-30B-A3B | 82.8 | 帧数未说明 | Tech report | [Y1] | N |
| MLVU | InternVL3.5-241B-A28B | 78.2 | M-Avg；在 16–64 帧中取最高 | Tech report | [I1] | N |
| LongVideoBench | Seed2.1 Pro | 80.6 | — | Model card | [S2] | N |
| LongVideoBench | Seed2.1 Turbo | 80.6 | — | Model card | [S2] | N |
| LongVideoBench | Seed2.0 Pro | 80.3 | — | Model card / Blog | [S5] [S6] | N |
| LongVideoBench | Keye-VL-671B-A37B | 79.0 | thinking | Model card | [Y3] | N |
| LongVideoBench | dots3-note Preview | 76.8 | — | Blog / Model card | [D1] [D2] | N |
| LongVideoBench | Keye-VL-2.0-30B-A3B | 74.1 | 2 fps | Tech report / Model card | [Y1] [Y2] | N |
| LongVideoBench | InternVL3.5-241B-A28B | 67.1 | val；在 16–64 帧中取最高 | Tech report | [I1] | N |
| CGBench | Seed2.0 Pro | 65.0 / 66.8 | 不用工具 / 用 VideoCut 工具 | Model card | [S5] | N |
| VideoEval-Pro | Seed2.0 Pro | 48.0 | 官网模型页写的是 47.3 | Model card | [S5] [S4] | N |
| CrossVid | Seed2.1 Pro | 65.0 | — | Model card | [S2] | N |
| CrossVid | Seed2.1 Turbo | 63.2 | — | Model card | [S2] | N |
| CrossVid | Seed2.0 Pro | 60.3 | 官网模型页写的是 61.0 | Model card | [S5] [S4] | N |
| EgoLife | Qwen3.8-Max | 80.3 | w/ Mem.（Qwen-MM-Plugins 记忆系统） | Blog | [Q1] | N |
| LVOmniBench | Qwen3.8-Omni-Flash | 63.3 / 73.6 | 长音视频；Static / Qwen Code（agentic） | Blog / Tech report | [Q2] [Q3] | N |

### 1.3 视频推理

| Benchmark | 模型 | 分数 | 设置/备注 | 来源类型 | 来源 URL | 自建? |
|---|---|---|---|---|---|---|
| Minerva | Seed2.1 Pro | 70.7 | ‡ | Model card / Blog | [S2] [S1] | N |
| Minerva | Seed2.1 Turbo | 65.9 | ‡ | Model card | [S2] | N |
| Minerva | Seed2.0 Pro | 66.5 | ‡ = 带字幕 | Model card / Blog | [S5] [S6] | N |
| Video-Holmes | Seed2.1 Pro | 68.2 | ‡ | Model card | [S2] | N |
| Video-Holmes | Seed2.1 Turbo | 67.6 | ‡ | Model card | [S2] | N |
| Video-Holmes | Seed2.0 Pro | 67.4 | ‡ = 带字幕 | Model card / Blog | [S5] [S6] | N |
| Video-Holmes | MiMo-V2.5 | 64.0 | 未说明设置 | Blog / Model card（图表） | [M1] [M2] | N |
| VideoReasonBench | Seed2.0 Pro | 77.8 | — | Model card / Blog | [S5] [S6] | N |
| Morse-500 | Seed2.0 Pro | 37.4 | 5 FPS；官网页拼作 "Morese-500" | Model card / Blog | [S5] [S4] | N |
| VideoZeroBench | dots3-note Preview | 17.4 | GPT-4o-mini 抽取答案，再由 GPT-OSS / GPT-4o / 规则判分 | Blog / Model card | [D1] [D2] | N |
| ZeroVideo | Seed2.0 Pro | 14.5 / 27.9 | 不用工具 / 用 VideoCut 工具；没有引用，也找不到公开出处 | Model card | [S5] | 疑似 |
| VideoDR | Qwen3.8-Max | 73.2 | w/ Search（可调用搜索工具） | Blog | [Q1] | N |

### 1.4 时序 / 运动 / 物理 / 定位 / 空间

| Benchmark | 模型 | 分数 | 设置/备注 | 来源类型 | 来源 URL | 自建? |
|---|---|---|---|---|---|---|
| TVBench | Qwen3.8-Max | 81.9 | — | Blog | [Q1] | N |
| TVBench | Seed2.1 Pro | 80.5 | — | Model card / Blog | [S2] [S3] | N |
| TVBench | Seed2.1 Turbo | 77.2 | — | Model card | [S2] | N |
| TVBench | Seed2.0 Pro | 75.0 | 2 FPS | Model card / Blog | [S5] [S6] | N |
| TOMATO | Seed2.1 Pro | 79.5 | — | Model card / Blog | [S2] [S1] [S3] | N |
| TOMATO | Seed2.1 Turbo | 56.8 | — | Model card | [S2] | N |
| TOMATO | Seed2.0 Pro | 59.9 / 65.3 | 2 FPS；标准 / +Thinking with Tracking（prompt 要求输出逐帧框） | Model card / Blog | [S5] [S6] | N |
| MotionBench | Seed2.1 Pro | 74.9 | — | Model card | [S2] | N |
| MotionBench | Seed2.1 Turbo | 74.8 | — | Model card | [S2] | N |
| MotionBench | Seed2.0 Pro | 75.2 | 2 FPS | Model card / Blog | [S5] [S6] | N |
| ContPhy | Seed2.1 Pro | 63.6 | — | Model card | [S2] | N |
| ContPhy | Seed2.1 Turbo | 61.1 | — | Model card | [S2] | N |
| ContPhy | Seed2.0 Pro | 67.4 | 2 FPS | Model card / Blog | [S5] [S6] | N |
| EgoTempo | Seed2.0 Pro | 71.8 | 2 FPS | Model card / Blog | [S5] [S6] | N |
| Charades-TimeLens（TimeLens 重标注版 Charades-STA） | Keye-VL-2.0-30B-A3B | 58.4 | mIoU；4 fps | Tech report / Model card | [Y1] [Y2] | N |
| ActivityNet-TimeLens | Keye-VL-2.0-30B-A3B | 58.5 | mIoU；4 fps | Tech report / Model card | [Y1] [Y2] | N |
| QVHighlights-TimeLens | Keye-VL-2.0-30B-A3B | 70.1 | mIoU；4 fps | Tech report / Model card | [Y1] [Y2] | N |
| VSI-Bench | InternVL3.5-241B-A28B | 69.5 | 未说明设置 | Tech report（Table 11） | [I1] | N |

### 1.5 流式 / 实时交互

| Benchmark | 模型 | 分数 | 设置/备注 | 来源类型 | 来源 URL | 自建? |
|---|---|---|---|---|---|---|
| OVOBench | Seed2.1 Pro | 80.7 | — | Model card / Blog | [S2] [S1] [S3] | N |
| OVOBench | Seed2.1 Turbo | 79.2 | — | Model card | [S2] | N |
| OVOBench | Seed2.0 Pro | 77.0 | — | Model card / Blog | [S5] [S6] | N |
| OVBench | Seed2.1 Pro | 70.0 | — | Model card / Blog | [S2] [S3] | N |
| OVBench | Seed2.1 Turbo | 69.7 | — | Model card | [S2] | N |
| OVBench | Seed2.0 Pro | 69.2 | — | Model card / Blog | [S5] [S6] | N |
| ODVBench | Seed2.0 Pro | 72.5 | — | Model card / Blog | [S5] [S6] | N |
| LiveSports-3K | Seed2.1 Pro | 76.8 | — | Model card | [S2] | N |
| LiveSports-3K | Seed2.1 Turbo | 77.1 | — | Model card | [S2] | N |
| LiveSports-3K | Seed2.0 Pro | 78.0 | — | Model card / Blog | [S5] [S6] | N |
| ViSpeak | Seed2.0 Pro | 78.5 | — | Model card / Blog | [S5] [S6] | N |
| StreamingBench | Qwen3.8-Omni-Flash | 80.8 | 归在音视频交互类 | Blog / Tech report | [Q2] [Q3] | N |
| QIVD | Qwen3.8-Omni-Flash | 69.6 | 归在音视频交互类 | Blog / Tech report | [Q2] [Q3] | N |
| ProactiveVideoQA | Qwen3.8-Omni-Flash | 61.5 | 只出现在技术报告中 | Tech report | [Q3] | N |

### 1.6 音视频联合（Omni）

| Benchmark | 模型 | 分数 | 设置/备注 | 来源类型 | 来源 URL | 自建? |
|---|---|---|---|---|---|---|
| DailyOmni | Qwen3.8-Omni-Flash | 85.1 | — | Blog / Tech report | [Q2] [Q3] | N |
| DailyOmni | MiMo-V2.5 | 83.5 | 小米把它归在 "Video Understanding" 类下 | Blog / Model card（图表） | [M1] [M2] | N |
| WorldSense | Qwen3.8-Omni-Flash | 68.5 | — | Blog / Tech report | [Q2] [Q3] | N |
| WorldSense | Seed2.0 Pro | 57.0 | 只出现在官网模型页；0215 版本没有音频输入，评测输入方式未说明 | Blog（官网模型页） | [S4] | N |
| AVUT | Qwen3.8-Omni-Flash | 86.6 | — | Blog / Tech report | [Q2] [Q3] | N |
| JointAVBench | Qwen3.8-Omni-Flash | 75.9 | 原表拼作 "JoinAVBench" | Blog / Tech report | [Q2] [Q3] | N |
| JointAVBench | Seed2.0 Pro | 62.3 | 只出现在官网模型页 | Blog（官网模型页） | [S4] | N |
| OmniVideoBench | Qwen3.8-Omni-Flash | 63.4 / 67.8 | Static / Qwen Code（agentic）；agentic 下每题 token 降约 45.7% | Blog / Tech report | [Q2] [Q3] | N |
| OmniVideoBench | Seed2.0 Pro | 49.5 | 只出现在官网模型页 | Blog（官网模型页） | [S4] | N |
| AVMeme | Seed2.0 Pro | 61.2 | 只出现在官网模型页 | Blog（官网模型页） | [S4] | N |
| MMOU | Qwen3.8-Omni-Flash | 78.8 | 只出现在技术报告中 | Tech report | [Q3] | N |
| AVSpeaker | Qwen3.8-Omni-Flash | 77.2 | 只出现在技术报告中 | Tech report | [Q3] | N |
| OmniCloze | Qwen3.8-Omni-Flash | 63.2 | 音视频描述 | Blog / Tech report | [Q2] [Q3] | N |
| OmniCap-IF | Qwen3.8-Omni-Flash | CSR 80.6 / ISR 28.2 | 音视频描述 | Blog / Tech report | [Q2] [Q3] | N |

- Qwen3.8-Omni 技术报告 Table 5 里还有几项交互或空间类指标，未列入上表
  - OmniVChat-Bench 89.0
  - ODUbench 91.64 / 89.57（Audio / VA）
  - Omni2Web 56.7 / 51.6
  - OmniEchoBench 43.9（报告正文写的是 41.7，前后不一致）

### 1.7 视频 Agent

| Benchmark | 模型 | 分数 | 设置/备注 | 来源类型 | 来源 URL | 自建? |
|---|---|---|---|---|---|---|
| AgenticVBench | Qwen3.8-Omni-Flash | 36.8 | 在 Claude Code harness 中跑 | Blog / Tech report | [Q2] [Q3] | N |

- 视频 agentic 结果在别的分组里也有，和本表一起看
  - LVBench / EgoLife w/ Mem.（Qwen3.8-Max）
  - VideoDR w/ Search（Qwen3.8-Max）
  - Seed 的 VideoCut 工具结果
  - Qwen Code 结果（Qwen3.8-Omni-Flash）

### 1.8 附表：同系列其他档位 / 旧版本（均为官方数据）

- **Seed2.0 Lite / Mini**（来源 [S5] [S6]；Lite 0428 一列只出现在 [S4]）

  | Benchmark | Lite (0215) | Mini (0215) | Lite (0428) |
  |---|---|---|---|
  | VideoMMMU | 84.1 | 80.6 | 88.3 |
  | MMVU | 75.0 | 69.0 | 76.7 |
  | VideoMME‡ | 87.7 | 81.2 | 89.0 |
  | VideoMMEv2 | — | — | 64.9 |
  | LVBench | 73.0 | 66.6 | 76.4 |
  | LongVideoBench | 77.3 | 74.8 | 79.0 |
  | VideoHolmes‡ / Minerva‡ | 63.8 / 63.8 | 58.6 / 54.7 | 67.4 / 68.5 |
  | TVBench / TOMATO | 71.5 / 57.3 | 70.5 / 47.4 | 80.4 / 72.5 |
  | MotionBench | 70.9 | 64.4（[S4] 写 65.1） | 72.4 |
  | OVOBench / OVBench | 76.7 / 65.5 | 70.4 / 60.1 | 75.4 / 63.2 |
  | VideoSimpleQA | 66.6 | 67.7 | 71.7 |

  - 其余行见 [S4]：CGBench、VideoEval-Pro、CrossVid、LiveSports-3K、ViSpeak、EgoTempo、ContPhy、Morse-500，以及音视频四项
  - 注：Qwen3.8-Omni 报告把 "Seed 2.0 Lite" 的 Video-MME-v2 记为 64.9，用的是 API 版本 `doubao-seed-2-0-lite-260428`，与上表 0428 一列一致

- **InternVL3.5 全尺寸**（[I1] Table 9 / 11；当前最新公开版本就是 3.5，还没有 InternVL4）

  | 尺寸 | Video-MME（无字幕/有字幕） | MVBench | MLVU | LongVideoBench | VSI-Bench |
  |---|---|---|---|---|---|
  | 1B | 52.4 / 55.0 | 61.0 | 56.6 | 53.0 | 49.3 |
  | 2B | 58.4 / 61.9 | 65.9 | 64.4 | 57.4 | 53.8 |
  | 4B | 65.4 / 68.6 | 71.2 | 70.4 | 60.8 | 54.9 |
  | 8B | 66.0 / 68.6 | 72.1 | 70.2 | 62.1 | 56.3 |
  | 14B | 67.9 / 71.0 | 72.8 | 72.1 | 62.7 | 60.8 |
  | 20B-A4B | 62.4 / 64.9 | 73.3 | 65.6 | 58.3 | 60.1 |
  | 30B-A3B | 68.7 / 71.8 | 72.1 | 73.0 | 63.8 | 63.7 |
  | 38B | 70.9 / 74.2 | 75.0 | 77.0 | 65.7 | 66.3 |
  | 241B-A28B | 72.9 / 76.0 | 76.5 | 78.2 | 67.1 | 69.5 |

- **Keye-VL-1.5-8B**（2025-08，[Y4] Table 3–5；thinking 模式）
  - 公开 benchmark
    - Video-MME（w/o sub.）73.0
    - Video-MMMU 66.0
    - TempCompass 75.5
    - LongVideoBench 66.0
    - MMVU 68.3
  - **自建视频评测集（自建 = Y）**：200 个 case，按 rubric 打 1–5 分
    - Overall 3.53
    - 分项：Correctness 3.73 / Completeness 4.62 / Relevance 4.85 / Fluency 4.59 / Creativity 3.64

- **MiMo-V2-Omni**（上一代；数据出自 [M1] 中的对照列）
  - Video-MME 85.3
  - DailyOmni 80.5
  - VideoHolmes 59.5

---

## 2. 没有公布视频 benchmark 分数的模型

- **DeepSeek V4.1-Flash**：没有任何视频分数
  - 这是一个图文模型，多模态部分只报了图像 benchmark（MMMU-Pro、CVBench、DocVQA、RefCOCO、BabyVision、ZeroBench 等）
  - 已查
    - V4.1-Flash / V4.1-Flash-1017 模型卡
    - 51 页的 `DeepSeek_V41_Tech_Report.pdf`（全文检索没有 video）
    - V4 / V4-Pro / V4-Flash-Vision-Exp 模型卡
  - api-docs 新闻页经代理打不开，没能核对
- **Tencent Hunyuan Hy4**（2026-11-04 正式发布）：没有视频分数
  - Multimodal 部分只有图像项：MMMU-Pro 78.6、ZeroBench-main 55.4、BuddyVQA（自建，图像）
  - 同代的 Hy4-preview 是纯文本模型
  - 没有 Hy4 代的 VL 或 Omni 变体
- **GLM-5V-Turbo**：只有相对增益 "MVBench +5.6%"（RL 相对 SFT），没有绝对分
  - 官方文档的 benchmark 图里有 14 项，没有视频项
  - 没有单独叫 "GLM-5V"（不带 Turbo）的公开模型
  - 智谱的视频分数来自同代的 GLM-5.3-Flash（见 1.1 节）
- **Kimi K3.1 Pro**（2026-11-02，K3 的继任）：模型卡和博客有视觉项，没有视频项
  - K3 发布博客里也没有视频项，K3 的两个视频分只出现在模型卡和技术报告中
- **MiMo-V2.6 Pro / Flash**（2026-09，支持视频输入）：技术报告 Table 3 只有 agentic 类项目，没有视频 benchmark
  - 官网博客要 JS 渲染，读不出来
- **MiMo-V2.5-Pro**：纯文本模型
- **Keye-Omni**：没有公开发布
  - 快照里的 Keye-Omni TARGET 和 stageX 都是内部数据，已忽略
- **Seed2.1 Lite / Mini**：官方没有这两个档位，2.1 只有 Pro 和 Turbo
- **InternVL3.5-Flash**：只报了图像和 OCR 项
- **InternVL-U**（2026-03）：没有视频项，而且它不是 InternVL3.5 的继任

---

## 3. 本地快照核对结果（只看本次范围内的公开模型）

| 快照模型 | 快照值 | 官方核对 | 结论 |
|---|---|---|---|
| Qwen3.8-Max | Video-MME 90.40 / VMME2 68.30 / LVBench 81.80, 85.60A / MMVU 82.40 / VideoMMMU 88.70 | 全部与 [Q1] 一致；85.6 对应 "LVBench w/ Mem."（记忆系统） | ✓ |
| Qwen3.8-Flash | VMME2 71.00 | 官方没有找到；Omni-Flash 博客里的 71.0 是 Gemini 3.8 Flash 的 Static 分，**疑似抄错位** | ✗ snapshot only |
| Qwen3.8-Flash | LVBench 76.60 | [Q3] [Q4] 一致 | ✓ |
| Qwen3.8-Omni-Flash | VMME2 65.00 / LVBench 76.90 | 一致（65.0 是 Static 分；Qwen Code 的 71.3 快照没收） | ✓ |
| Seed2.1 Pro | Video-MME 89.20 | 一致 | ✓ |
| Seed2.0 Pro | Video-MME 89.50 / MMVU 78.20 / VideoMMMU 86.90 | 一致 | ✓ |
| Seed2.0 Pro | VMME2 60.50 / 43.30A | 60.5 一致（[S4] 印作 60.5*）；43.3 官方没有找到 | 60.5 ✓ / 43.3 snapshot only |
| Seed2.0 Pro | LVBench 76.40 / 80.00A | 一致；80.0 是用 VideoCut 工具的分 | ✓ |
| Keye-VL 2.0 | Video-MME 78.30 | 一致（w/o sub.） | ✓ |
| Keye-VL 2.0 | VMME2 42.44 / 24.19A | 官方为 512 帧下 ACC 42.4 / **Non-Lin 24.2**：第二个数是 Non-Lin 分，**不是 Agentic 分** | 数值 ✓，标注 ✗ |
| Keye-VL 2.0 | LVBench 60.90 / MMVU 69.60 | 技术报告 Table 2 和模型卡里都没有这两项 | snapshot only |
| Keye-VL 2.0 | VideoMMMU 80.90 | 官方值是 80.0 | ✗ 以官方为准 |
| dots3-note preview | VMME2 39.30A | 官方 39.26（卡上 39.3），设置是"开启音频输入"，没有说是 agentic | 数值 ✓，标注存疑 |
| dots3-note preview | MMVU 79.90 / VideoMMMU 86.80 | 一致 | ✓ |
| MiMo-V2.5 | Video-MME 87.70 | 一致（官方没说是否带字幕） | ✓ |
| DeepSeek V4.1-Flash | 视频列全空 | 官方确实没有视频分 | ✓ |

- **系统性提示**：快照里 Video-MME 2 一列的「A」值，在 Keye 那一行已经证实其实是 Video-MME v2 的 **Non-Lin score**
  - 其他行（如 Seed2.0 Pro 43.3）很可能也是这样，但没有找到官方出处，未能证实
- **快照漏收的官方数据**
  - Kimi K3（Video-MME 90.0、MMVU 82.1）
  - GLM-5.3-Flash（MVBench 77.8、MMVU 80.5）
  - InternVL3.5 全系列
  - Seed2.1 的 13 项视频分
- **范围外的旁注**：Qwen3.8-Max 博客里 Qwen3.7-Plus 的对照值是 LVBench 76.2 / w/ Mem. 74.5，而快照中 Qwen3.7-Plus 记为 78.80 / 84.20A
  - 快照这两个数恰好等于同一张表里 GPT5.6-Sol 的值，疑似抄错列
  - 没有核对 Qwen3.7 自己的发布博客

---

## 4. Sources

- **本地**
  - [L0] 本地快照 `/mmu_mllm_hdd_4/deep-research/kim-leaderboard/output/leaderboard.html`（2026-11-03 导出，无来源链接）
- **Alibaba Qwen**
  - [Q1] Qwen3.8-Max 博客（2026-08-03）https://qwen.ai/blog?id=qwen3.8
  - [Q2] Qwen3.8-Omni-Flash 博客（2026-09-14）https://qwen.ai/blog?id=qwen3.8-omni-flash
  - [Q3] Qwen3.8-Omni 技术报告（2026-09-23）https://arxiv.org/abs/2609.25611
  - [Q4] Qwen3.8-Flash-Next 博客（2026-08-03）https://qwen.ai/blog?id=qwen3.8-flash-next
  - [Q5] Qwen3.8-Flash-Next 模型卡 https://huggingface.co/Qwen/Qwen3.8-Flash-Next
  - 已查但没有视频项：Qwen3.8-2.4T-A95B（纯文本）和 Qwen3.8-27B 的模型卡，以及 Flash-Next 技术报告 PDF
  - 注：qwen.ai 博客是 JS 渲染页，本次经 r.jina.ai 渲染后读到原表
- **ByteDance Seed**
  - [S1] Seed2.1 官网模型页 https://seed.bytedance.com/en/seed2_1
  - [S2] Seed2.1 Model Card PDF（Table 10）https://lf3-static.bytednsdoc.com/obj/eden-cn/lapzild-tss/ljhwZthlaukjlkulzlp/seed2.1/Seed2_1_Model_Card.pdf
  - [S3] Seed2.1 发布博客 https://seed.bytedance.com/en/blog/seed2-1-officially-released-advancing-ai-productivity
  - [S4] Seed2.0 官网模型页（含 Lite 0428 的更新）https://seed.bytedance.com/en/seed2
  - [S5] Seed2.0 Model Card PDF（Table 9 / 10）https://lf3-static.bytednsdoc.com/obj/eden-cn/lapzild-tss/ljhwZthlaukjlkulzlp/seed2/0214/Seed2.0%20Model%20Card.pdf
    - arXiv 版内容相同：https://arxiv.org/abs/2607.00248
  - [S6] Seed2.0 发布博客 https://seed.bytedance.com/en/blog/seed2-0-%E6%AD%A3%E5%BC%8F%E5%8F%91%E5%B8%83
- **Moonshot Kimi**
  - [K1] Kimi K3 模型卡 https://huggingface.co/moonshotai/Kimi-K3
  - [K2] Kimi K3 技术报告（Table 2）https://github.com/MoonshotAI/Kimi-K3/blob/main/k3_tech_report.pdf
  - [K3] Kimi K3 发布博客（没有视频项）https://www.kimi.com/blog/kimi-k3
  - [K4] Kimi K3.1 Pro 博客（没有视频项）https://www.kimi.com/blog/kimi-k3-1-pro
- **Zhipu GLM**
  - [Z1] GLM-5.3-Flash 博客 https://z.ai/blog/glm-5.3-flash
  - [Z2] GLM-5V-Turbo 技术报告 https://arxiv.org/abs/2604.26752
- **Xiaomi MiMo**
  - [M1] MiMo-V2.5 博客 https://mimo.xiaomi.com/mimo-v2-5
  - [M2] MiMo-V2.5 模型卡 https://huggingface.co/XiaomiMiMo/MiMo-V2.5
  - [M3] MiMo-V2.6 技术报告（没有视频项）https://huggingface.co/XiaomiMiMo/MiMo-V2.6-Pro-RL/blob/main/MiMo_V2_6_technical_report.pdf
- **Shanghai AI Lab InternVL**
  - [I1] InternVL3.5 技术报告（Table 9 / 11）https://arxiv.org/abs/2508.18265
- **Kuaishou Keye**
  - [Y1] Keye-VL-2.0 技术报告（Table 2）https://arxiv.org/abs/2606.10651
  - [Y2] Keye-VL-2.0-30B-A3B 模型卡 https://huggingface.co/Kwai-Keye/Keye-VL-2.0-30B-A3B
  - [Y3] Keye-VL-671B-A37B 模型卡（分数在 performance 图片中）https://huggingface.co/Kwai-Keye/Keye-VL-671B-A37B
  - [Y4] Keye-VL-1.5 技术报告 https://arxiv.org/abs/2509.01563
- **rednote dots**
  - [D1] dots3 技术博客 https://studio.dots.ai/dots/dots3-en.html
  - [D2] dots3-note-prev 模型卡 https://huggingface.co/dots-studio/dots3-note-prev
  - 发布方已迁到 HF 组织 dots-studio，GitHub 迁到 studio-dots-ai
- **Tencent Hunyuan**
  - [H1] Hy4 官方发布页（没有视频项）https://hy.tencent.ai/research/hy4?langVersion=en
  - [H2] Hy4-preview 模型卡（纯文本）https://huggingface.co/tencent/Hy4-preview
- **DeepSeek**
  - [DS1] DeepSeek HF 组织（V4.1-Flash 模型卡和 `DeepSeek_V41_Tech_Report.pdf`，没有视频项）https://huggingface.co/deepseek-ai

[L0]: #4-sources
[Q1]: https://qwen.ai/blog?id=qwen3.8
[Q2]: https://qwen.ai/blog?id=qwen3.8-omni-flash
[Q3]: https://arxiv.org/abs/2609.25611
[Q4]: https://qwen.ai/blog?id=qwen3.8-flash-next
[Q5]: https://huggingface.co/Qwen/Qwen3.8-Flash-Next
[S1]: https://seed.bytedance.com/en/seed2_1
[S2]: https://lf3-static.bytednsdoc.com/obj/eden-cn/lapzild-tss/ljhwZthlaukjlkulzlp/seed2.1/Seed2_1_Model_Card.pdf
[S3]: https://seed.bytedance.com/en/blog/seed2-1-officially-released-advancing-ai-productivity
[S4]: https://seed.bytedance.com/en/seed2
[S5]: https://lf3-static.bytednsdoc.com/obj/eden-cn/lapzild-tss/ljhwZthlaukjlkulzlp/seed2/0214/Seed2.0%20Model%20Card.pdf
[S6]: https://seed.bytedance.com/en/blog/seed2-0-%E6%AD%A3%E5%BC%8F%E5%8F%91%E5%B8%83
[K1]: https://huggingface.co/moonshotai/Kimi-K3
[K2]: https://github.com/MoonshotAI/Kimi-K3/blob/main/k3_tech_report.pdf
[Z1]: https://z.ai/blog/glm-5.3-flash
[Z2]: https://arxiv.org/abs/2604.26752
[M1]: https://mimo.xiaomi.com/mimo-v2-5
[M2]: https://huggingface.co/XiaomiMiMo/MiMo-V2.5
[I1]: https://arxiv.org/abs/2508.18265
[Y1]: https://arxiv.org/abs/2606.10651
[Y2]: https://huggingface.co/Kwai-Keye/Keye-VL-2.0-30B-A3B
[Y3]: https://huggingface.co/Kwai-Keye/Keye-VL-671B-A37B
[Y4]: https://arxiv.org/abs/2509.01563
[D1]: https://studio.dots.ai/dots/dots3-en.html
[D2]: https://huggingface.co/dots-studio/dots3-note-prev

