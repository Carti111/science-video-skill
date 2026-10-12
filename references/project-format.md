# 项目记录和执行

`project.json` 放在本次视频的项目目录，路径默认相对于该文件目录。它保存阶段交接，不能把文稿只留在聊天里。每次更新 phase、文稿版本、sources、media、pages 和生成结果。不要保存 API 密钥。

`scripts/init-project.mjs <project-directory> <model-name>` 创建第一阶段记录、默认 style 和 timing 设置；不生成假旁白或最终工程。Codex 填入真实旁白、厂商与资料，并交付后置 phase 为 awaiting_narration。

第二阶段必要字段示例（索引为 0 起）：

```json
{
  "schemaVersion": 1,
  "modelName": "用户指定的模型",
  "manufacturer": "查证后的厂商",
  "draftName": "用户指定的模型_科普",
  "phase": "awaiting_narration",
  "delivery": "package",
  "runtime": {},
  "audio": {
    "path": "media/narration.mp3",
    "phrasesFile": "alignment/phrases.json"
  },
  "timing": {
    "introExtraSeconds": 1.18,
    "chapterExtraSeconds": 1.58,
    "closingChapterSeconds": 0.475,
    "sentenceExtraSeconds": 0.18,
    "tailExtraSeconds": 1.0,
    "pauseAfterPhrases": [1, 3]
  },
  "pages": [
    {
      "title": "模型名称",
      "narration": "本页完整旁白",
      "firstPhrase": 0,
      "revealPhrase": 2,
      "frames": ["frames/page-1-start.png", "frames/page-1-full.png"],
      "demo": {
        "sources": [{"path": "media/official-demo.mp4", "duration": 12.0}],
        "box": {"left": 470, "top": 166, "width": 746, "height": 420}
      }
    }
  ],
  "sources": [],
  "media": []
}
```

`audio.nativeTiming` 可代替 phrasesFile，指向 codec 解出的配音草稿 JSON。只设置其中一个。所有页的 firstPhrase 单调递增，第一页从 0 开始；revealPhrase 应属于本页，用真实文字含义决定，不填字符比例估计。

随附渲染器采用每页两个完整布局 PNG：标题位置一致，第二张增加一个大内容块。初始图可已有一块正文，后一张统一增加剩余信息，不必拆成逐句状态。需要三个以上出现阶段时应扩展 phases 和真实配音 cue，而不是为了满足脚本切碎内容。图片只是渲染输入，不替代 editable PPT 交付。旁白录制之前可准备布局草稿，最终自动推进时间必须从本次 timeline 推导。

demo.sources 一项为单片，两个为同步对比。每项 duration 为实测原片时长；可选 sourceStart 表示选取原片起点。双片要求所选区间采用同一镜头进度，不能仅让两个无关视频同时开播就宣称是同场景对比。box 必须在 canvas 内，宽高为偶数。双片使用中缝 48 px，并等第二块淡入后统一起播。

项目 style 默认读取 assets/style.json，可用 style 字段覆盖；嵌套 colors/box 覆盖时给完整对象。timing 数值可调；要考虑音频已有停顿。配音文件和时间记录不一致时脚本拒绝继续。project.json 或配音变更后，必须从 sync-narration 重新生成。build-draft 拒绝覆盖既有 package；输出新修订目录，不清除用户已经修改的包。

执行顺序：

```text
node scripts/sync-narration.mjs <project.json>
node scripts/render-video.mjs <project.json>
node scripts/build-draft.mjs <project.json>
node scripts/check-output.mjs <project.json>
```

project runtime 可覆盖 nodePath、nodeModules、ffmpegPath、codecPath、jianyingInstallDir、testedJianyingVersion、draftRoot、indexPath。交付 local/both 时在校验通过后再执行 register-draft：

```text
node scripts/register-draft.mjs <output/draft-package> --draft-root <root> --index <index-json>
```

register-draft 是外部目录写入，仍需正常工具权限；本机参数必须先核实。测试使用隔离 workspace 和模拟首页 index，禁止借测试改写真实剪映草稿。

导出结果位于项目 output：preview.mp4、media/ppt_base.mp4、media/narration.wav、media/demo_*.mp4、captions.srt、draft-package。build/timeline.json 保存统一时间，build/validation.json 保存验证范围。完成后将 project.phase 改为 completed 并记录结果；这是最终步骤，不要在工具链运行到一半时改 project 导致输入 hash 失配。
