# Science Video Skill

当前正式版本：**[v1.0.0](https://github.com/Carti111/science-video-skill/releases/tag/v1.0.0)**。发布介绍见 [RELEASE_NOTES.md](RELEASE_NOTES.md)。

把官方资料、旁白、PPT 图解和模型演示，整理成一条可以继续在剪映里调整的科普视频。

这是一个 **Codex Skill**，不是一键生成视频的网站。目前主要围绕世界模型介绍设计：先交付文稿，用户完成配音后，再按真实音频制作同步画面和工程。仓库名是 `science-video-skill`，调用名仍为 **`$world-model-video`**。

## 制作流程

```text
指定模型和重点
    ↓
官方资料与演示素材 → 旁白稿、分镜、素材出处
    ↓
用户生成配音并提供音频
    ↓
真实时间对齐 → 适量停顿 → PPT 文字动效与演示同步
    ↓
带旁白预览 + 可编辑剪映三轨草稿
```

**第一阶段：先交付旁白。** 核实模型与厂商，优先使用官方演示视频，其次官方图片，输出可一次粘贴到配音工具的完整旁白。没有音频时，不假定最终时间轴已对齐。

**第二阶段：收到配音再制作。** 根据真实句子时间安排页面、文字块、停顿与演示。不是按字数比例猜时间，也不会把用户音频强行拉慢凑时长。

## 画面与剪辑约定

- 深色石墨底、16:9、统一字体与配色，底部留出字幕空间。
- 标题换页即出现，正文按含义分大块淡入，避免逐句切碎。
- 默认演示开头保持静止 **1.5 秒**，末尾停留约 **1 秒**；均可调整。
- 双栏对比共用原片播放时钟，两栏显示就位后一起播放。
- 直接读取和修改文件，不操控屏幕、鼠标或键盘。
- 新建版本，不覆盖旧工程；修改已有工程时保留用户字幕、效果和未修改的片段。
- 科普内容区分模型能力与外部物理引擎的作用，不把概念动画当模型实测。

## 最终可以调整什么

| 剪映轨道 | 内容 | 编辑范围 |
| --- | --- | --- |
| PPT 底片 | 静音图解与文字动效 | 整段剪切、移动、替换 |
| 演示视频 | 官方演示或对比片段 | 位置、大小、时长、剪切、效果 |
| 旁白 | 用户配音与新增停顿 | 音量、剪切、移动、替换 |

文字动效已烘焙在 PPT 底片，不是剪映中逐字可编辑的文字对象。可编辑 PPT 是另一份交付物。双栏对比可以合成一个演示片段，此时左右不能分别作为独立轨道调整。字幕默认另存 SRT，不自动增加第四条轨道。

支持两种工程交付，也可同时提供：

- **工程包**：全部媒体、原生草稿结构、路径重映射与手动导入工具。
- **本机草稿**：用户授权后，注册到实际剪映草稿目录与首页列表。

工程包不是从剪映「导入媒体」按钮选择一个 JSON 文件。导入工具会创建新目录、重映射媒体路径、备份首页索引并登记新草稿，拒绝覆盖已有项目。

## 安装与调用

将仓库放入 Codex 的个人 Skill 目录，目录名使用 `world-model-video`。Windows PowerShell 示例：

```powershell
git clone https://github.com/Carti111/science-video-skill.git "$HOME/.codex/skills/world-model-video"
Set-Location "$HOME/.codex/skills/world-model-video"
npm install
```

已有同名 Skill 时先备份，不直接覆盖。重新打开会话后调用：

```text
使用 $world-model-video，制作一期关于【模型名称】的科普视频。
目标约 90 秒，重点介绍【能力】。先给我旁白稿和分镜，优先找官方演示视频。
```

生成配音后继续同一项目：

```text
配音放在【音频绝对路径】。继续制作，协调旁白停顿与演示长度，
输出三轨剪映工程包，不操作我的屏幕。
```

只想讨论方案也可以直接说明，Skill 不应提前创建视频或修改工程。

## 依赖与本机配置

| 功能 | 依赖 |
| --- | --- |
| 研究、旁白与分镜 | 可用的官方资料检索工具 |
| 可编辑 PPT | 当前可用的 PPT 制作工具；随附脚本不直接生成 PPTX |
| 时间同步、底片和演示渲染 | Node.js 24、sharp、支持 H.264 编码的 FFmpeg |
| 原生剪映工程 | Windows 剪映、匹配版本的 native codec、本机路径配置 |

公共仓库**不包含** FFmpeg、codec 的 `.exe`、剪映 DLL、本机 `.env`、配音、演示视频和个人工程。这些依赖和素材需在本机准备。

通用配置在 `assets/runtime-profile.json`。把机器相关设置写入 **`assets/runtime-profile.local.json`**（已被 Git 忽略），例如：

```json
{
  "ffmpegPath": "D:/Tools/ffmpeg/bin/ffmpeg.exe",
  "jianyingInstallDir": "D:/Apps/JianyingPro/11.5.0.14471",
  "draftRoot": "D:/JianyingDrafts",
  "indexPath": "C:/Users/YOUR_NAME/AppData/Local/JianyingPro/User Data/Projects/com.lveditor.draft/root_meta_info.json"
}
```

这些是示例，不是剪映安装位置的通用保证。需要核实实际目录和版本。配置优先级：**项目 `runtime` > 本机配置 > 通用默认值**。FFmpeg 默认从 PATH 查找；sharp 默认使用仓库 `node_modules`。

codec 源码位于 `assets/codec/jy-draftc.cpp`，保留其 MIT 许可和原作者归属。可在本机的 MSVC 开发环境编译，例如：

```powershell
cl /std:c++17 /EHsc /utf-8 assets/codec/jy-draftc.cpp /Fe:assets/codec/jy-draftc.exe
Copy-Item assets/codec/.env.example assets/codec/.env
```

把 `.env` 中 `JY_INSTALL_DIR` 改为与本机配置相同的实际剪映安装目录。这不代表任意版本都能工作：必须先进行完整 JSON 语义的编码/解码往返校验。codec 依赖本机剪映 DLL，仓库不提供这些 DLL。

## 脚本入口

先由 Codex 按官方资料和用户要求准备文稿、页面与素材，再执行工具链。脚本不会自动下载资料、生成配音或把任意输入自动转换成完整 PPT。

```powershell
node scripts/init-project.mjs projects/my-model "模型名称"
# 填入项目资料；用户提供配音后配置 project.json 和真实句子时间。
node scripts/sync-narration.mjs projects/my-model/project.json
node scripts/render-video.mjs projects/my-model/project.json
node scripts/build-draft.mjs projects/my-model/project.json
node scripts/check-output.mjs projects/my-model/project.json
```

句子时间使用 `[{start,end,text}]`（秒），或已解码的剪映配音时间线。没有时间记录时，需先做真实转录/对齐；脚本不内置语音识别模型。随附渲染器默认每页两个大块状态，可按需要扩展。

项目配置详见 [project-format.md](references/project-format.md)，剪映结构与保存细节见 [jianying-draft.md](references/jianying-draft.md)。

输出目录包含 `preview.mp4`、静音底片、带停顿旁白、独立演示、SRT 和 `draft-package`。校验通过后，用户可保存当前剪映项目并返回首页，双击包里的 `import-draft.cmd`，确认目标并输入 `IMPORT`。更换电脑要重新配置本机路径与兼容 codec。

## 验证与限制

目前已验证 **Windows 剪映专业版 11.5.0.14471**，草稿格式 `360000 / 187.0.0`。其他版本、macOS 和 CapCut 不能据此认定兼容。

检查包括原始解码 PCM 样本保留、视频完整解码与帧数、PPT 状态、演示静止/运动/尾帧、双栏共同时钟、素材引用和 native round-trip。原声保留是指解码为 48 kHz 单声道 PCM 后的样本，不是源文件字节不变。隔离导入检查验证路径重映射与旧首页条目保留；文件检查不等同于剪映 GUI 播放测试。

官方素材可访问不等于可无限制转载，发布前核实其使用条件。仓库当前未声明整体项目许可证；第三方 codec 的 MIT 许可与各依赖自己的许可单独适用。请勿提交 API 密钥、账号、配音、个人工程或本机路径配置。
