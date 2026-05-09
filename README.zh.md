# Eve Recorder

中文 | [English](README.md)

Eve Recorder（原名 `eve`，取自 `eavesdropper`）是一个以托盘常驻为核心的桌面录音应用。它可以长时间录制麦克风、自动分段存档，并使用 `sherpa-onnx` 的 Qwen3 ASR 与 Silero VAD 做实时转写和离线补转写。

## 功能特性

- 长时间麦克风录音与自动分段
- 基于 Qwen3 ASR 的实时转写（可关闭）
- 仅语音录制模式 — 仅保存 VAD 检测到的语音片段
- 实时音频波形可视化
- 手动选择麦克风，并可自动切到更活跃的输入设备
- 同时支持 WAV 与 FLAC 输出
- 支持对已有 WAV/FLAC 录音做批量转写
- 按天分组的录音历史浏览
- 提供会场模式，用于稳定展示中文 / 日文内容
- 提供复核与学习模式，保留原文 / 自动改善版 / 人工修正版三层文本
- 支持说话人资料与候选纠错规则沉淀
- 系统托盘应用，支持开机自启、启动即录、自动更新
- 中英双语界面
- 亮色 / 暗色 / 跟随系统主题

## 项目结构

```text
apps/desktop        Electron 主进程 / preload / renderer、托盘、打包
packages/shared     主进程与渲染进程共享的 TypeScript 类型
scripts             工作区级开发辅助脚本
```

## 桌面应用预览

![Eve Recorder 桌面应用](docs/images/desktop-gui-preview.png)

## 下载

- 发布页面：[nexmoe/eve Releases](https://github.com/nexmoe/eve/releases)
- macOS：`.dmg` 或 `.zip`
- Windows：`.exe`（NSIS 安装包）

打包后的桌面端会自动检查更新，并在退出时安装已下载的更新。

## 运行说明

- 首次开始录音或转写时，Eve Recorder 会自动下载 Qwen3 ASR 和 Silero VAD 模型，并缓存到应用用户数据目录。

## 开发快捷命令

```bash
bun run dev:desktop
bun run stop:desktop
bun run restart:desktop
```

- `dev:desktop` 启动 Electron 桌面端开发环境
- `stop:desktop` 停止当前工作区匹配到的 Eve 桌面开发进程
- `restart:desktop` 先停止当前桌面开发进程，再重新启动
- `bash scripts/stop-desktop.sh --dry-run` 可先查看哪些进程会被停止

## 复核流程

- 在 `历史` 中打开某一天录音，进入 `复核与学习`
- 逐段查看 `原始转写`、`自动改善版`、`人工修正版`
- 保存人工修正后，会回写对应分段的 sidecar JSON
- 已命名说话人可持续积累备注、出现语言和候选纠错规则
- 候选规则可在说话人面板中确认或驳回

## 输出内容

- 音频和同名 JSON 会按日期归档到 `recordings/YYYYMMDD/`
- 文件名形如 `eve_YYYYMMDD_HHMMSS.wav` 或 `.flac`
- 每个分段都会写出同名 `.json`，保存转写文本和元数据

示例 JSON：

```json
{
  "audio_file": "eve_20260201_120513.wav",
  "audio_path": "/path/to/recordings/20260201/eve_20260201_120513.wav",
  "backend": "sherpa-onnx",
  "created_at": "2026-02-01T12:05:13.000Z",
  "input_device": "MacBook Air Microphone",
  "model": "Qwen3 ASR",
  "segment_start_time": "2026-02-01T12:05:13.000Z",
  "status": "ok",
  "text": "请起来活动一下。"
}
```

## 更多文档

- [开发者指南](docs/development.zh.md)
- [更新日志](CHANGELOG.md)
