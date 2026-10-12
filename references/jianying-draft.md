# 剪映文件适配

## 已验证环境

Windows 剪映专业版 11.5.0.14471，draft version 360000，new_version 187.0.0。内容和 meta 可为加密文本，扩展名 JSON 不意味着明文 JSON。适配器默认路径是 `assets/codec/jy-draftc.exe`，仓库只保存源码和 MIT 归属；可执行文件需在本机准备。它依赖已安装剪映的 DLL，不能假定任意版本可用。

本机路径默认在 runtime-profile 中，运行前验证。`.env` 的 `JY_INSTALL_DIR` 应对应当前实际安装。`--enc <json> <output>` 保存 native 文件，`--dec <native> <json>` 读回。必须比较 round-trip 的完整语义，而不仅检测文件存在。

## 三轨约定

1. video 主轨：PPT 底片，volume=0，speed=1，render_index=0。
2. video 叠加轨：演示片段，volume=0，speed=1，render_index=1，flag=2。
3. audio：旁白，volume=1，speed=1。

轨道名明确。不要按标题或句子额外拆字幕轨道；SRT 为可选附件。双栏对比可以是一段合成演示，不宣称左右还能独立编辑。

用已验证的 native video/audio segment seed 创建素材与附属引用。每个轨道、segment、material、local material、timeline、draft、project 都应生成独立 UUID；不复用老项目 ID。将 seed 中 device_id、MAC、旧路径和旧项目资料去除。

material.duration、source_timerange 与 target_timerange 使用微秒；源区间不得超过文件实际长度，时间线不得越界。保持 speeds 附属素材与 segment.speed 一致。媒体材质的 width/height 必须匹配实际文件。

缩放按 fit-to-canvas 算：`scale=1/min(canvasWidth/mediaWidth,canvasHeight/mediaHeight)`。目标中心坐标转成 `x=(centerX-canvasWidth/2)/(canvasWidth/2)`，`y=(canvasHeight/2-centerY)/(canvasHeight/2)`。用实际导出预览核实位置，不能靠一个旧 scale 值适配所有素材。

## 需要一致的文件

草稿根：draft_content.json、draft_content.json.bak、template-2.tmp、draft_meta_info.json、draft_cover.jpg、draft_settings、timeline_layout.json。

Timelines/project.json 与其 bak 记录 main_timeline_id。Timelines/<timelineId>/ 下的 draft_content.json、bak、template-2.tmp 应与主内容同步；template.tmp 为对应明文内容。根和 timeline 的封面保持一致。带上经过清理的 agency、editing 与 pc_common 配置。

meta 中 draft_id 与 timeline ID 不同，draft_fold_path、draft_root_path、tm_duration、素材大小与文件实际一致。material.path 和 meta.draft_materials 内 file_Path 都要指向最终媒体位置。

## 工程包与本机生成

`package`：交付包含媒体的完整文件夹。打包时媒体路径指向包目录；包内 import-data 保存可重新映射的 content/meta，import-tools 保存独立导入工具。用户保存工程并返回首页后，可双击 import-draft.cmd，核对目标并输入 IMPORT。这是文件注册工具，不是剪映媒体导入菜单，不虚构“导入任意 JSON”的功能。不同电脑先核实 runtime-profile.json 与 codec/.env 的本机路径。

`local`：读取实际 draftRoot 和首页 indexPath，检查新项目目录不存在，备份首页 JSON，复制包，按目标目录改写路径、重新序列化，然后登记 all_draft_store。写入前比较 index 是否变化，保留其他条目。不修改首页 root_path，不覆盖其他草稿。

`both`：同时保留可导入工程包和已登记本机项目。复制或换电脑后必须重新映射绝对路径，不能把只在旧位置可用的草稿称为可移植。

注册中途失败时不覆盖用户新写入的首页列表；保留候选文件和备份并报告具体问题。文件验证通过不代表 GUI 已播放测试。本 Skill 禁止屏幕操作，用户可以自行重启剪映刷新列表。

## 修改用户现有工程

先读当前 native 文件并记录 hashes。用户刚编辑过就读取新版本，不能用先前的缓存覆盖。新增字幕、material_animations、keyframes、用户效果与未修改的片段保留。重新映射所有受时间更改影响的 segment，包括字幕。备份具体原项目，并在写入前再次比较原 hash。无法精确重定时的用户效果应保留原稿并说明限制，而不是静默删除。

随附脚本默认只创建新项目，不覆盖已有项目；更新工作需遵循上面的保留要求。Skill 创建或验证阶段不得修改真实用户草稿。
