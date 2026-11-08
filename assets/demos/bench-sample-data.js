// 视频生成评测 benchmark 的数据卡。每个 benchmark 三条样本，用标签页切换。
// 标注取自各数据集官方文件原文，视频为原始文件未转码。
const DEMOS = {
 "vbench": {
  "bench": "VBench",
  "src": "github.com/Vchitect/VBench · prompts/",
  "samples": [
   {
    "tab": "按维度切的 prompt",
    "novid": "VBench 不分发视频。<br>它分发的是 <b>prompt 套件 + 每维一条评测脚本</b>——<br>你用自己的模型按 prompt 生成，再跑它的 pipeline 打分。",
    "q": "每个维度一个独立 prompt 文件，各维度不复用同一批 prompt",
    "a": "<span class=\"t\">11 个维度文件 · 946 条 prompt</span><span class=\"sub\">注意写法：「a red bicycle」短到只剩待测的那一个属性——画面里出错就一定是那一项错了。prompt 越复杂，失分越无法归因。</span>",
    "cat": "解耦式自动评测，每维一条专用 pipeline，不共用总分",
    "rows": [
     [
      "维度",
      "prompt 数",
      "样例"
     ],
     [
      "appearance_style",
      "90",
      "A beautiful coastal beach in spring, waves l"
     ],
     [
      "color",
      "85",
      "a red bicycle"
     ],
     [
      "human_action",
      "100",
      "A person is riding a bike"
     ],
     [
      "multiple_objects",
      "82",
      "a bird and a cat"
     ],
     [
      "object_class",
      "79",
      "a person"
     ],
     [
      "overall_consistency",
      "93",
      "Close up of grapes on a rotating table."
     ],
     [
      "scene",
      "86",
      "alley"
     ],
     [
      "spatial_relationship",
      "84",
      "a bicycle on the left of a car, front view"
     ],
     [
      "subject_consistency",
      "72",
      "a person swimming in ocean"
     ],
     [
      "temporal_flickering",
      "75",
      "In a still frame, a stop sign"
     ],
     [
      "temporal_style",
      "100",
      "A beautiful coastal beach in spring, waves l"
     ]
    ],
    "note": "这套 prompt 是「一条只测一件事」的设计，和后面 VideoPhy 那种「一条同时压语义与物理」的设计正相反。"
   },
   {
    "tab": "按内容类别切的 prompt",
    "novid": "另一套切法：<b>同一批能力维度，换 8 类内容再测一遍</b>。<br>用来回答「这个模型是不是只在某类内容上好」。",
    "q": "prompts_per_category/ 下 8 个文件，每类 100 条",
    "a": "<span class=\"t\">8 类 × 100 条 = 800 条</span><span class=\"sub\">维度切法测「能力」，类别切法测「覆盖」。两套是正交的，官方排行榜两套都跑。</span>",
    "cat": "同一评测脚本，换一批 prompt 输入",
    "rows": [
     [
      "内容类别",
      "prompt 数",
      "样例"
     ],
     [
      "animal",
      "100",
      "a black dog wearing halloween costume"
     ],
     [
      "architecture",
      "100",
      "an apartment building with balcony"
     ],
     [
      "food",
      "100",
      "freshly baked finger looking cookies"
     ],
     [
      "human",
      "100",
      "people carving a pumpkin"
     ],
     [
      "lifestyle",
      "100",
      "kids celebrating halloween at home"
     ],
     [
      "plant",
      "100",
      "video of a indoor green plant"
     ],
     [
      "scenery",
      "100",
      "scenery of desert landscape"
     ],
     [
      "vehicles",
      "100",
      "a modern railway station in malaysia use for"
     ]
    ],
    "note": "一个模型可以在 human 类上很好、在 architecture 类上崩掉——总分会把这件事平均掉。"
   },
   {
    "tab": "真值长什么样",
    "novid": "VBench 的真值不是分数，是<b>结构化的答案键</b>。<br>每条 prompt 附带「这条要检查什么」，<br>评测脚本据此自动判定，不需要人。",
    "q": "metadata/ 下每个维度一个 json，逐条给出待检属性",
    "a": "<span class=\"t\">prompt 与判据一一对应</span><span class=\"sub\">这就是自动化的前提：prompt 写成「a red bicycle」，答案键写成 color_en=red，脚本只需检测画面里的自行车是不是红的。</span>",
    "cat": "自动判定，无人工标注",
    "rows": [
     [
      "维度",
      "答案键",
      "一条完整样本"
     ],
     [
      "color",
      "color_en",
      "a red bicycle → red"
     ],
     [
      "object_class",
      "object_en",
      "a person → person"
     ],
     [
      "multiple_objects",
      "object_en",
      "a bird and a cat → bird and cat"
     ],
     [
      "spatial_relationship",
      "object_a / object_b / relationship",
      "a bicycle on the left of a car → bicycle｜car｜on the left of"
     ],
     [
      "appearance_style",
      "style_en",
      "A beautiful coastal beach…, Van Gogh style → Van Gogh style"
     ]
    ],
    "note": "答案键能写出来，这一维才能自动测。写不出答案键的维度（比如「好不好看」）只能退回人评或学一个判官模型。"
   }
  ]
 },
 "vgrb": {
  "bench": "VideoGen-RewardBench",
  "src": "KwaiVGI · 25,234 条三元组",
  "samples": [
   {
    "tab": "三维一致",
    "pair": [
     {
      "label": "A · CogVideoX",
      "clip": "vgrb_cog_102.mp4"
     },
     {
      "label": "B · Kling 1.5",
      "clip": "vgrb_kling_102.mp4"
     }
    ],
    "q": "<span class=\"t\">Static camera, a glass ball rolls on a smooth tabletop.</span><span class=\"sub\">同一条 prompt 交给两个模型，标注员逐维比较，不给绝对分。</span>",
    "a": "总体：<span class=\"t\">B 更好</span>",
    "rows": [
     [
      "维度",
      "判决"
     ],
     [
      "视觉质量 VQ",
      "B 更好"
     ],
     [
      "运动质量 MQ",
      "B 更好"
     ],
     [
      "文本对齐 TA",
      "B 更好"
     ],
     [
      "总体 Overall",
      "B 更好"
     ]
    ],
    "note": "最省事的一种：三个维度指向同一边，聚合成 Overall 没有争议。全集里这样的只占少数。"
   },
   {
    "tab": "维度互斥",
    "pair": [
     {
      "label": "A · CogVideoX",
      "clip": "vgrb_cog_103.mp4"
     },
     {
      "label": "B · Open-Sora 1.2",
      "clip": "vgrb_opensora_103.mp4"
     }
    ],
    "q": "<span class=\"t\">Static camera, a metal ball rolls on a smooth tabletop.</span><span class=\"sub\">同一条 prompt 交给两个模型，标注员逐维比较，不给绝对分。</span>",
    "a": "总体：<span class=\"t\">A 更好</span>",
    "rows": [
     [
      "维度",
      "判决"
     ],
     [
      "视觉质量 VQ",
      "B 更好"
     ],
     [
      "运动质量 MQ",
      "A 更好"
     ],
     [
      "文本对齐 TA",
      "A 更好"
     ],
     [
      "总体 Overall",
      "A 更好"
     ]
    ],
    "note": "画质判 B 好、运动与对齐判 A 好——<b>这就是维度正交的硬证据</b>。全集 79.0% 的样本三维判决并不完全一致，用一个总分训奖励模型会把这类信息压掉。"
   },
   {
    "tab": "含平局",
    "pair": [
     {
      "label": "A · CogVideoX",
      "clip": "vgrb_cog_102.mp4"
     },
     {
      "label": "B · EasyAnimate v4",
      "clip": "vgrb_easyanim_102.mp4"
     }
    ],
    "q": "<span class=\"t\">Static camera, a glass ball rolls on a smooth tabletop.</span><span class=\"sub\">同一条 prompt 交给两个模型，标注员逐维比较，不给绝对分。</span>",
    "a": "总体：<span class=\"t\">A 更好</span>",
    "rows": [
     [
      "维度",
      "判决"
     ],
     [
      "视觉质量 VQ",
      "打平"
     ],
     [
      "运动质量 MQ",
      "A 更好"
     ],
     [
      "文本对齐 TA",
      "B 更好"
     ],
     [
      "总体 Overall",
      "A 更好"
     ]
    ],
    "note": "76.8% 的样本至少有一维是「打平」。平局不是噪声，是「这一维分不出来」——训练时当成随机标签会引入实打实的错误监督。"
   }
  ]
 },
 "videophy": {
  "bench": "VideoPhy",
  "src": "UCLA · 3,360 条人工标注",
  "samples": [
   {
    "tab": "两维都对",
    "clip": "videophy_ok.mp4",
    "q": "<span class=\"t\">Honey diffusing into warm milk.</span><span class=\"sub\">生成模型：lavie　物态：fluid_fluid</span>",
    "a": "语义遵循 <b>是</b>　·　物理常识 <b>是</b>",
    "cat": "逐条二元标注，多数投票聚合；两维独立标，不合成总分",
    "note": "两维都对的只占 <b>16.3%</b>。这是全集里最少见的一格。"
   },
   {
    "tab": "语义对、物理错",
    "clip": "videophy_sem_ok_phys_bad.mp4",
    "q": "<span class=\"t\">Honey diffusing into warm milk.</span><span class=\"sub\">生成模型：vc2　物态：fluid_fluid</span>",
    "a": "语义遵循 <b>是</b>　·　物理常识 <b>否</b>",
    "cat": "逐条二元标注，多数投票聚合；两维独立标，不合成总分",
    "note": "<b>和左边是同一条 prompt，换了个模型。</b>画面确实在「蜂蜜倒进牛奶」，但扩散过程不符合直觉物理——这一格占 <b>26.6%</b>，是两维都对的 1.6 倍。用 CLIP 文视相似度做验收，这 26.6% 会全部放行。"
   },
   {
    "tab": "两维都错",
    "clip": "videophy_both_bad.mp4",
    "q": "<span class=\"t\">Stamp presses into the ink pad.</span><span class=\"sub\">生成模型：opensora　物态：solid_solid</span>",
    "a": "语义遵循 <b>否</b>　·　物理常识 <b>否</b>",
    "cat": "逐条二元标注，多数投票聚合；两维独立标，不合成总分",
    "note": "两维都错占 41.1%。注意这三条的判定<b>只有是/否，没有分数</b>——二元判据的一致性远高于打分，代价是分不出「错得多离谱」。"
   }
  ]
 },
 "videophy2": {
  "bench": "VideoPhy-2",
  "src": "UCLA · 3,397 条，1,114 条带规则级归因",
  "samples": [
   {
    "tab": "投掷",
    "clip": "videophy2_hammer.mp4",
    "q": "<span class=\"t\">An athlete throws a hammer, the rotation of the hammer head clearly visible against the sky.</span><span class=\"sub\">动作类别：hammerthrow　生成模型：ray2</span>",
    "a": "语义遵循 <b>3/5</b>　·　物理常识 <b>1/5</b>",
    "cat": "5 级打分 + 规则级归因：不只给分，还指出违反了哪一条",
    "rows": [
     [
      "物理规则",
      "判定"
     ],
     [
      "The sledgehammer travels downwards after reaching its highest point.",
      "遵守"
     ],
     [
      "The sledgehammer's position changes over time.",
      "遵守"
     ],
     [
      "The sledgehammer travels upwards after being released.",
      "违反",
      "hi"
     ]
    ],
    "note": "语义 3 分、物理 1 分，<b>并且指明了错在哪条</b>——「链球脱手后向上飞」。这是比一个总分更接近可用监督的形态。"
   },
   {
    "tab": "撕纸",
    "clip": "videophy2_paper.mp4",
    "q": "<span class=\"t\">A hand rips a sheet of printer paper in half, creating a jagged tear.</span><span class=\"sub\">动作类别：ripping paper　生成模型：wan</span>",
    "a": "语义遵循 <b>3/5</b>　·　物理常识 <b>1/5</b>",
    "cat": "5 级打分 + 规则级归因：不只给分，还指出违反了哪一条",
    "rows": [
     [
      "物理规则",
      "判定"
     ],
     [
      "The paper changes shape from rectangular to having a jagged edge.",
      "遵守"
     ],
     [
      "The area of the paper decreases after tearing.",
      "遵守"
     ],
     [
      "The two separated pieces of paper remain on the surface.",
      "违反",
      "hi"
     ]
    ],
    "note": "同样是 3/1，违反的却是完全不同的一条规则。<b>归因标签把「物理错」这一类拆开了</b>，否则两条样本在训练里长得一模一样。"
   },
   {
    "tab": "跳远",
    "clip": "videophy2_longjump.mp4",
    "q": "<span class=\"t\">A long jump is captured from a low angle, the jumper's body creating a distinct parabolic curve.</span><span class=\"sub\">动作类别：longjump　生成模型：videocrafter</span>",
    "a": "语义遵循 <b>1/5</b>　·　物理常识 <b>1/5</b>",
    "cat": "5 级打分 + 规则级归因：不只给分，还指出违反了哪一条",
    "rows": [
     [
      "物理规则",
      "判定"
     ],
     [
      "The person's feet make contact with the track.",
      "遵守"
     ],
     [
      "The person moves downwards in the frame.",
      "遵守"
     ],
     [
      "The person's body maintains its shape and size.",
      "违反",
      "hi"
     ]
    ],
    "note": "违反的是「人体保持形状与大小」。<b>但归因只到规则一级，仍然没说是第几帧、画面哪个位置</b>——这正是缺陷定位拿不到现成监督的地方。"
   }
  ]
 },
 "videofeedback": {
  "bench": "VideoFeedback",
  "src": "TIGER-Lab · 37.6K 视频 / 11 个生成模型",
  "samples": [
   {
    "tab": "文视对齐塌陷",
    "clip": "vf_align_fail.mp4",
    "q": "<span class=\"t\">Shifting universe, distorted, dislocation, splitting powerful image of a humanoid mecha  </span><span class=\"sub\">样本 id 2002231　标注为 1–4 级逐条打分</span>",
    "a": "五维分别打分，最低的一维是 <b>文视对齐</b>",
    "cat": "逐条打分 + 多维标量，可直接当回归目标",
    "dims": [
     {
      "k": "画面质量",
      "v": 3,
      "max": 4
     },
     {
      "k": "时序一致性",
      "v": 3,
      "max": 4
     },
     {
      "k": "动态程度",
      "v": 3,
      "max": 4
     },
     {
      "k": "文视对齐",
      "v": 1,
      "max": 4
     },
     {
      "k": "事实一致性",
      "v": 3,
      "max": 4
     }
    ],
    "note": "其余四维都是 3 分，唯独文视对齐 1 分。<b>这种单维塌陷正是多维标注的价值</b>——合成一个总分，这条样本会看起来只是「中等偏下」。"
   },
   {
    "tab": "事实一致性塌陷",
    "clip": "vf_factual_fail.mp4",
    "q": "<span class=\"t\">The mother is seen sweeping the floors, dusting furniture, and arranging the house. Make the atmosphere calm b</span><span class=\"sub\">样本 id 4001748　标注为 1–4 级逐条打分</span>",
    "a": "五维分别打分，最低的一维是 <b>事实一致性</b>",
    "cat": "逐条打分 + 多维标量，可直接当回归目标",
    "dims": [
     {
      "k": "画面质量",
      "v": 3,
      "max": 4
     },
     {
      "k": "时序一致性",
      "v": 3,
      "max": 4
     },
     {
      "k": "动态程度",
      "v": 3,
      "max": 4
     },
     {
      "k": "文视对齐",
      "v": 3,
      "max": 4
     },
     {
      "k": "事实一致性",
      "v": 1,
      "max": 4
     }
    ],
    "note": "换一条：塌的是事实一致性，其余四维仍是 3 分。<b>塌陷的维度不同，需要的修法完全不同</b>，但总分看不出区别。"
   },
   {
    "tab": "静止骗过其他维",
    "clip": "vf_static.mp4",
    "q": "<span class=\"t\">dead tiger in forest with blood rodent cartoon style  </span><span class=\"sub\">样本 id 5000835　标注为 1–4 级逐条打分</span>",
    "a": "五维分别打分，最低的一维是 <b>动态程度</b>",
    "cat": "逐条打分 + 多维标量，可直接当回归目标",
    "dims": [
     {
      "k": "画面质量",
      "v": 3,
      "max": 4
     },
     {
      "k": "时序一致性",
      "v": 3,
      "max": 4
     },
     {
      "k": "动态程度",
      "v": 1,
      "max": 4
     },
     {
      "k": "文视对齐",
      "v": 2,
      "max": 4
     },
     {
      "k": "事实一致性",
      "v": 2,
      "max": 4
     }
    ],
    "note": "动态程度 1 分——画面基本不动。<b>不动的画面天然不容易出现时序闪烁与形变</b>，所以时序一致性反而拿到 3 分。这是奖励模型最容易被钻的空子：优化总分会把模型推向「少动」。"
   }
  ]
 }
};

