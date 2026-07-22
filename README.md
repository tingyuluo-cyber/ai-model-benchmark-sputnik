# 斯普特尼克一号 · AI 模型小横评

> 随着 Kimi K3 上线体验的时候心血来潮，顺手把手边能用的模型都拉过来跑了一遍同一道测试题。
> 不做排名，不立靶子，只是搞了一个简单的小横测，看看各家模型在同一个目标下各自走出了怎样的路径。

## 这是什么

给所有参与测试的模型下发了同一条提示词，让它们各自生成一个「斯普特尼克一号」3D 展示网页。

提示词（统一）：

```text
创建一个网页，中心为可以自由拖动旋转展示的斯普特尼克一号，实体建模。
网页美观简洁，黑白色主基调，介绍这颗卫星。
```

随后又加做了一组「微缩城市」的额外小测试，提示词同样统一，放在 `微缩城市额外小测试/` 目录下。

每个子文件夹对应一次完整的模型调用记录，里面包含：

- 该模型最终产出的网页源码
- 当轮对话的轮数、思考强度、耗时
- 模型的回答原文与过程中的追问 / 修改记录

## 参与横评的模型组合

| 编号 | 编码客户端          | 模型                     | 思考强度     | 对话轮数 | 总耗时                 |
| ---- | ------------------- | ------------------------ | ------------ | -------- | ---------------------- |
| 1    | workbuddy           | kimi K3                  | default      | 1 轮     | 7m6s                   |
| 2    | workbuddy           | HY3                      | high         | 2 轮     | 4m22s + 3m7s           |
| 3    | workbuddy           | GLM5.2                   | high         | 1 轮     | 3m37s                  |
| 4    | minimax code        | minimax M3               | thinking     | 1 轮     | 2m11s                  |
| 5    | workbuddy           | DeepSeek V4 pro          | high         | 1 轮     | 1m10s                  |
| 6    | codex               | GPT5.6 SOL               | high         | 3 轮     | 21m51s + 4m5s + 1m57s  |
| 7    | cursor              | grok4.5                  | high fast    | 2 轮     | ? + 2m37s              |
| 8    | cursor              | composer2.5              | fast         | 1 轮     | 2m51s                  |
| 9    | antigravity         | gemini3.6 flash          | high         | 4 轮     | 12m + 2m + 26s         |
| 10   | cursor              | opus4.8                  | high         | 1 轮     | 2m18s                  |
| 11   | cursor              | fable5                   | high         | 1 轮     | 5m1s                   |

完整的统一提示词、各轮对话原文、思考强度与耗时统计，详见
`斯普特尼克一号小横评/统一提示词与过程统计.md`。

## 目录结构

```
.
├── 斯普特尼克一号小横评/
│   ├── 统一提示词与过程统计.md      # 提示词 + 各模型轮数 / 耗时 / 回答原文
│   ├── workbuddy+kimi K3-deault/
│   ├── workbuddy+HY3-high/
│   ├── workbuddy+GLM5.2-high/
│   ├── minimax code+minimax M3-thinking/
│   ├── workbuddy+DeepSeek V4 pro-high/
│   ├── codex+GPT5.6 SOL-high/
│   ├── cursor+grok4.5-high fast/
│   ├── cursor+composer2.5-fast/
│   ├── antigravity+gemini3.6flash-high/
│   ├── cursor+opus4.8-high/
│   └── cursor+fable5-high/
└── 微缩城市额外小测试/
    ├── 统一提示词.txt
    ├── workbuddy+kimi K3-deault/
    ├── minimax code+minimax M3-thinking/
    └── codex+GPT5.6 SOL-extra high/
```

## 关于这份横评

这不是一份严谨的基准测试，也没有打分和榜单。各家的思考强度档位名称不尽相同，客户端
环境也不完全一致，只当作一次随手记录的横向观察。

若你对其中某个模型的实际产物感兴趣，直接进对应子文件夹双击 `index.html` 即可看到原始
网页（部分模型需要本地起一个静态服务器，相关说明写在各自的回答原文里）。
