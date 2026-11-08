## Contents

- [Perception](#perception)
- [Temporal Spatial Grouding](#temporal-spatial-grouding)
- [Human Alignment](#human-alignment)

涉及模型训练的部分，包括 VLM 基础感知能力的增强（通用世界知识到视频帧中像素 pixel 的对齐），增强视频理解的时空定位能力，对齐评测人员的偏好。

### Perception

### Temporal Spatial Grouding

时空定位走 RLVR，奖励函数的形状由任务的对应结构决定：预测区间与真值实例之间的对应 σ 是被给定还是要被求解、基数是否已知，把任务分成四格。判错格，模型总能找到一条绕过去的路，而训练曲线看起来完全正常。完整推导、奖励公式与实测数据在 [RL for Spatio-Temporal Video Grounding](../surveys/survey.html)，下面是预览：

<div align="center">
  <iframe src="../charts/doc-preview.html"
          data-src="surveys/survey.html"
          data-name="RL for Spatio-Temporal Video Grounding"
          data-path="surveys/survey.html"
          style="width:100%;height:620px;border:1px solid #e4e7ec;border-radius:12px;" title="RL for Spatio-Temporal Video Grounding · 预览"></iframe>
</div>

### Human Alignment

<div align="center">
  <iframe src="../charts/doc-preview.html"
          data-src="https://my.feishu.cn/docx/NL19dLyjXochYYxAdkUch4GBngf"
          data-name="[Post-Train] On-Policy vs Off-Policy"
          data-path="my.feishu.cn/docx/NL19dLyj…"
          style="width:100%;height:620px;border:1px solid #e4e7ec;border-radius:12px;" title="On-Policy vs Off-Policy · 预览"></iframe>
</div>

