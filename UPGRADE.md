# 跟随 Flutter 官方版本升级指引

本 fork 基于 MPFlutter 官方仓库（upstream），适配分支为 `flutter-3.38`（已验证 Flutter 3.38.10）。
MPFlutter 2.0 本身不需要裁剪/修改 Flutter SDK，它由三部分组成：

| 组件 | 仓库 | 作用 |
| --- | --- | --- |
| mpflutter_core | mbc-travis/mpflutter | 运行时 Dart 包（rendering/bridge） |
| mpflutter_build_tools | mbc-travis/mpflutter_build_tools | 构建工具，把 `flutter build web` 产物转成小程序 |
| Flutter SDK | 官方 flutter/flutter | 标准 SDK，无需 fork |

因此"适配新 Flutter"= 让上面两个包在新 SDK 下正常编译、构建，而不是改 SDK。

## 升级到新 Flutter 版本的步骤

1. 切换本地 Flutter SDK 到目标版本（puro/fvm 均可），例如：
   ```bash
   puro use 3.41   # 或 fvm install 3.41.0 && fvm use 3.41.0
   ```
2. 同步上游 MPFlutter 的更新（先做这一步，官方可能已经适配）：
   ```bash
   ./scripts/sync_upstream.sh flutter-3.38
   ```
   若官方 master 已支持目标版本，冲突处理完后直接进入第 4 步验证即可。
3. 按 Flutter 官方 breaking changes 修正两个包：
   - `flutter build web` 的命令行参数变化（参考 `wechat_builder.dart` / `wegame_builder.dart`
     中已有的按版本分支写法，如 `--web-renderer`、`--no-wasm-dry-run`、`-O1`）。
   - `mpflutter_core` 中使用的 Flutter/Dart API 是否被移除（`flutter analyze` 检查）。
   - `dart:js` / `dart:html` 相关：小程序产物走 dart2js（JS），只要不用 `--wasm` 编译即可继续使用；
     若未来官方强制 wasm，需要把 `dart:js` 迁移到 `dart:js_interop`。
   - pubspec 依赖约束冲突（如 `web`、`window_manager`）。
4. 验证：
   ```bash
   cd mpflutter && flutter analyze && flutter pub get
   # 用验证工程构建小程序
   cd ../miniapp_verify && flutter pub get && dart run scripts/build_wechat.dart
   # 产物在 build/wechat，用微信开发者工具导入验证
   ```
5. 更新 `mpflutter_build_tools/lib/main.dart` 中的 `verifiedMaxVersion` 为新版本，提交推送。

## 已知按版本分支的构建参数（wechat_builder.dart / wegame_builder.dart）

| Flutter 版本 | 处理 |
| --- | --- |
| < 3.29 | 传 `--web-renderer canvaskit` |
| >= 3.29 | 不传 `--web-renderer`（已移除） |
| >= 3.32 | 追加 `--no-wasm-dry-run` |
| >= 3.35 | debug 构建用 `-O1` 替代 `--dart2js-optimization O1` |

## 授权提示

MPFlutter 2.0 构建工具声明非完全开源，商用需购买授权；fork 仅用于内部版本适配，
请勿对外分发，详见官方 README 授权章节。
