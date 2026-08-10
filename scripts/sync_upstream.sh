#!/usr/bin/env bash
# 同步上游 MPFlutter 官方更新到当前 fork 的适配分支。
# 用法: ./scripts/sync_upstream.sh [branch]  （默认 flutter-3.38）
set -e

BRANCH="${1:-flutter-3.38}"
UPSTREAM_URL="https://github.com/mpflutter/mpflutter_build_tools.git"

git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"

echo "[1/3] fetch upstream..."
git fetch upstream

echo "[2/3] checkout $BRANCH..."
git checkout "$BRANCH"

echo "[3/3] merge upstream/master..."
if git merge upstream/master --no-edit; then
  echo "合并成功，请执行构建验证后推送。"
else
  echo "存在冲突，请手动解决后执行: git commit && git push"
  exit 1
fi
