## Contents

- [Background](#background)
- [Roadmap](#roadmap)
- [Evaluation System](#evaluation-system)
- [Data Pipline](#data-pipline)
- [Agentic Critic](#agentic-critic)
- [Training](#training)

## Background
视频生成本身已从单镜头、短时长和简单指令，演进为多主体、多镜头、长视频、复杂叙事、音视频联合以及参考生成。质量评估的关注点也从基础画质，拓展到主体一致性、动作与事件完整性、时空连续性、物理合理性、复杂指令遵循和音画匹配。传统的低层视觉指标与单一总分，已难以全面覆盖这些新的质量要求。因此，我们需要建设一套面向多模态 omni 视频生成的质检能力体系。

### Goal

Kling-Critic 将覆盖以下生产场景, 并释放不同价值:

| 生产场景 | 价值体现 | 落地产出 | 
| :--- | :--- | :--- |
| Evaluation | 提升自动评测覆盖率，降低人工质检成本 | 面向多模态 omni 生成的视频质检系统 | 
| Foundation Model PostTrain | 支持对基模生成结果的排序、拒绝采样、训练数据的过滤 | 面向视频生成基模后训练的 Outcome Reward Model | 
| Video Agent | 支持 video agent 在 harness 中多轮交互的过程监督 / Multi-Turn Agentic RL 过程中的细粒度信用分配 |  面向视频生成 Agent 的 Process Reward Model(Verifier) |


当前阶段优先在 Evaluation 场景进行落地, 完成视频质检的时空定位和推理生成。Outcome Reward / Process Reward(Verifier) 作为后续演进方向，分阶段释放价值。

## Roadmap

| 建设路线阶段 | 核心任务 |
| :--- | :--- |
| 评测体系与数据基建 | 定义机评维度；建设质检数据基建、标注规范 |
| 搭建 Agentic Critic 质检平台 | 基于自研闭源强模型，优化迭代 Harness 及组件，建设多模态 omni 质检平台，上线视频质检提效系统 |
| 自研模型与数据飞轮 | 基于人机协同的质检提效系统持续回流人类专家的高质量数据，回流难负样本形成数据飞轮；通过强化多模态 omni 生成场景的视频感知能力优化质检系统 |
| 赋能视频生成 Reward System | 建设 Outcome RM & Process RM，打通质检能力到视频生成后训练的闭环 |

<div align="center">
  <iframe src="charts/milestone.html" style="width:100%;height:480px;border:1px solid #e4e7ec;border-radius:12px;" title="Kling-Critic 建设路线 Milestone"></iframe>
</div>

## Evaluation System

确定机评维度，完成标签到原子能力的映射，定义统一质检输出协议。标签体系分三级，一级维度覆盖音频 / 一致性 / 指令遵循 / 画面质量 / 动态质量，三级标签是标注与裁决的最小判定单元。tag 不会全部进入机评，取舍看两件事：历史人评一致性（是否过于主观）、与其它 tag 的边界是否清晰。边界治理动作分「改体系」（合并 / 重命名 / 移出 / 删除）与「划范围」（硬隔离 / 锚定 / 互斥 / 禁用 / 降级）两类。

<div align="center">
  <iframe src="charts/tag-system.html" style="width:100%;height:820px;border:1px solid #e4e7ec;border-radius:12px;" title="Kling-Critic 标签体系" allow="autoplay"></iframe>
</div>

## Data Pipline

历史标注只给视频级结论，不给「哪一帧、哪个位置、为什么」，因此既缺 grounding 与 reasoning 的训练信号，也无法做失败归因。数据侧要从 Kling 线上真实用户数据回捞多模态 omni 生成样本，构造难度分级、跨模态、跨参考素材量级的训练与评测集。质检数据集按训练阶段分两类：**Perception Data** 驱动基础感知的 Pre / Mid Training，**Alignment Data** 驱动偏好判别规则的 SFT / RFT。

<table>
<thead>
<tr>
<th>训练阶段</th>
<th>数据类型</th>
<th>核心标注字段</th>
<th>关键注意事项</th>
</tr>
</thead>
<tbody>
<tr>
<td rowspan="3"><strong>Perception</strong><br><small>Pre / Mid Training</small></td>
<td>正例（命中标签，真实 Badcase）</td>
<td>维度、帧区间、bbox、严重度、observation、evidence</td>
<td>允许单条视频标注多个问题；须帧级 grounding</td>
</tr>
<tr>
<td>负例</td>
<td>无缺陷判断、关键正常证据、不可误判边界</td>
<td>防止模型只会挑错；正负例比例需合理配比，控制误报</td>
</tr>
<tr>
<td>反事实</td>
<td>缺陷类型、修改时段与区域、修改前后对照</td>
<td>单变量修改为原则；避免篡改痕迹（压缩块、颜色断层）成为模型的识别捷径</td>
</tr>
<tr>
<td rowspan="2"><strong>Alignment</strong><br><small>SFT / RFT</small></td>
<td>Pointwise</td>
<td>reasoning、severity、label</td>
<td>依赖 Agentic Critic 上线后的人机协同复核：Critic 召回疑似问题 → 人工复核修正 → 回流难负样本</td>
</tr>
<tr>
<td>Pairwise / Listwise</td>
<td>glb-rank、glb-reasoning、l2-rank、l2-reasoning</td>
<td>优先构建难度接近的对组；避免模型只学习明显质量差异，忽略细粒度判别能力</td>
</tr>
</tbody>
</table>

<div align="center">
  <iframe src="charts/annotation-demo.html" style="width:100%;height:600px;border:1px solid #e4e7ec;border-radius:12px;" title="统一标注数据格式 · Pointwise Demo"></iframe>
</div>

## Agentic Critic

基础感知（召回证据）与偏好对齐（证据判别）解耦，形成能够 scaling 的方案。在 Recall + Verifier 两阶段主干下同步探索 Workflow（工具与流程编排先验确定）与 Auto Planning（原子能力封装为工具，Agent 自主规划调用）两种模式，共享同一套 Harness 环境资产 —— Tools、Rubric、Trajectory。

| 工具 | 谁在用 | 负责什么判定 | 为什么不交给 VLM |
| :--- | :--- | :--- | :--- |
| **垂域小模型** | Kling-Critic（自研） | 专门用于质检部分通用模型较难识别的顽固垂类标签 | 通用模型在这些垂类上较难识别 |
| **Grounding DINO**（开放词表检测器） | VideoScience-Judge | 按开放词表验证实体是否存在、属性对不对 | 给的是带坐标的确定答案；VLM 生成坐标不可靠 |
| **ByteTrack**（多目标追踪） | VideoScience-Judge | 身份关联，量化时空一致性 | 跨帧关联同一实例，VLM 的稀疏帧输入做不到 |
| **追踪**（未指明具体实现） | VideoArgus | 主体身份、源保留 | 同上 |
| **RAFT / SEA-RAFT**（光流） | VideoScience-Judge、VideoGen-Eval | 运动方向与幅度；动态程度 | 纯运动统计量，VLM 只能给主观印象 |
| **CLIP4Clip / CLIP** | VideoScience-Judge、VideoGen-Eval | 文视对齐 | 便宜的稠密相似度 |
| **DINO 特征** | VideoGen-Eval | 时序一致性 | 特征空间距离 |
| **LPIPS**（感知相似度） | VideoScience-Judge（有参考视频时） | 与参考的感知差异 | 有参考时比语义判断更准 |
| **OCR** | VideoArgus、TRACE | 可见文字是否正确 | 给出逐字符读数与位置，可与参考文案逐字比对 |
| **深度估计** | VideoArgus、VideoGen-Eval | 空间结构合理性 | 几何量，VLM 无法量化 |
| **感知质量评估（IQA）** | VideoArgus | 画面质量 | 专用模型小三个数量级、相关性不输 |
| **SAM / SAM2**（分割） | VideoGen-Eval、DirectorBench | 区域切分 | 给出精确边界 |
| **目标检测**（未指明） | TRACE | 建立可检索的实体时间线 | 同 Grounding DINO |
| **裁剪 / 放大 / 轮廓叠加** | PriVE-Tools、Skyra（自驱动 probe） | 小区域细看 | 把小目标放大到 VLM 能看清的尺度 |
| **动态帧采样** | AIGVE-MACS | 按内容变化选关键帧 | 降低帧预算，把算力花在有信息的帧上 |

## Training

涉及模型训练的部分，包括 VLM 基础感知能力的增强（通用世界知识到视频帧中像素 pixel 的对齐），增强视频理解的时空定位能力，对齐评测人员的偏好。三条线分别是 Perception、Temporal Spatial Grouding、Human Alignment。
<div align="center">
  <iframe src="charts/doc-preview.html"
          data-src="surveys/survey.html"
          data-name="RL for Spatio-Temporal Video Grounding"
          data-path="video-rl/survey.html"
          style="width:100%;height:620px;border:1px solid #e4e7ec;border-radius:12px;" title="RL for Spatio-Temporal Video Grounding · 预览"></iframe>
</div>


