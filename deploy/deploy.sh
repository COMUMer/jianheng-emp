#!/usr/bin/env bash
# 主机侧发布：加锁、备份、经加速源拉取镜像、切换容器、健康检查，失败回滚到上一版本。
set -euo pipefail
umask 077

cd "$(dirname "$0")"

TAG="${1:?用法: deploy.sh sha-abc1234}"
STAMP="$(date +%F-%H%M%S)"
PREVIOUS="$(cat .current 2>/dev/null || true)"
echo "==> 发布 ${TAG}（上一版本：${PREVIOUS:-无}）"
# 备份与日志步骤也会解析 compose 文件，给个占位值避免 "IMAGE_TAG 未设置" 的告警。
export IMAGE_TAG="${PREVIOUS:-unknown}"

exec 9>deploy.lock
if ! flock -n 9; then
  echo "!! 另一个发布正在进行，占用进程：" >&2
  fuser -v deploy.lock >&2 || true
  echo "!! 确认没有发布进程后执行：fuser -k $(pwd)/deploy.lock" >&2
  exit 1
fi

mkdir -p backup

if docker compose ps --status running --services 2>/dev/null | grep -qx mysql; then
  echo "==> 备份数据库与附件"
  docker compose exec -T mysql sh -c 'exec mysqldump --single-transaction --databases "$MYSQL_DATABASE" -uroot -p"$MYSQL_ROOT_PASSWORD"' \
    | gzip > "backup/db-${STAMP}.sql.gz"
  tar czf "backup/uploads-${STAMP}.tgz" -C /var/lib/jh-emp uploads
else
  echo "==> 数据库未运行，跳过备份"
fi

# 服务器到 ghcr.io 的大文件传输会被限速到近乎停滞：按顺序尝试加速源，最后回退官方源。
# 加速源把 ghcr.io/ 前缀换成镜像站域名，例如 ghcr.1ms.run/<owner>/<repo>:<tag>。
MIRRORS="${GHCR_MIRRORS:-ghcr.nju.edu.cn ghcr.1ms.run ghcr.io}"
MIRROR_COUNT=$(echo "${MIRRORS}" | wc -w)
# 单个来源的拉取上限，防止网络卡住时长时间占用发布锁。
PULL_TIMEOUT="${PULL_TIMEOUT:-300}"
echo "==> 拉取镜像（顺序：${MIRRORS}，单个来源上限 ${PULL_TIMEOUT} 秒）"
for ref in $(IMAGE_TAG="${TAG}" docker compose config --images); do
  case "${ref}" in */jianheng-emp-server:*) IMAGE="${ref%:*}" ;; esac
  path="${ref#ghcr.io/}"
  pulled=""
  attempt=0
  echo "   · ${path}"
  for mirror in ${MIRRORS}; do
    attempt=$((attempt + 1))
    if [ "${mirror}" = "ghcr.io" ]; then candidate="${ref}"; else candidate="${mirror}/${path}"; fi
    started=$(date +%s)
    if timeout "${PULL_TIMEOUT}" docker pull -q "${candidate}" >/dev/null; then
      echo "     [${attempt}/${MIRROR_COUNT}] ${mirror} 完成，用时 $(( $(date +%s) - started ))s"
      pulled="${candidate}"
      break
    fi
    echo "     [${attempt}/${MIRROR_COUNT}] ${mirror} 失败，用时 $(( $(date +%s) - started ))s，换下一个" >&2
  done
  if [ -z "${pulled}" ]; then
    echo "!! ${ref} 拉取失败或超时（每个来源 ${PULL_TIMEOUT} 秒），线上未改动；可手动预拉后重试" >&2
    exit 1
  fi
  if [ "${pulled}" != "${ref}" ]; then
    docker tag "${pulled}" "${ref}"
    # 加速源的名字只是拉取时的临时别名，去掉以免同名镜像堆积。
    docker rmi "${pulled}" >/dev/null 2>&1 || true
  fi
done

if [ -f .current ]; then
  echo "==> 切换后端容器"
  IMAGE_TAG="${TAG}" docker compose up -d --no-deps backend
else
  echo "==> 首次部署，启动全部服务"
  IMAGE_TAG="${TAG}" docker compose up -d
fi

echo "==> 健康检查"
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/api/health 2>/dev/null | grep -q '"status":"UP"'; then
    printf '%s\n' "${TAG}" > .current
    # 本地 latest 跟随线上版本，避免它长期指向过期镜像。
    docker tag "${IMAGE}:${TAG}" "${IMAGE}:latest"
    # 只保留当前与上一个版本的镜像，历史版本不再占磁盘。
    for tag in $(docker images --filter=reference="${IMAGE}" --format '{{.Tag}}'); do
      case "${tag}" in
        "${TAG}"|"${PREVIOUS}"|latest) ;;
        *) docker rmi "${IMAGE}:${tag}" >/dev/null 2>&1 || true ;;
      esac
    done
    docker image prune -f >/dev/null
    find backup -type f -mtime +7 -delete
    echo "==> 完成：${TAG}"
    exit 0
  fi
  sleep 2
done


echo "!! 健康检查失败，回滚" >&2
docker compose logs --tail=50 backend >&2 || true
if [ -n "${PREVIOUS}" ]; then
  IMAGE_TAG="${PREVIOUS}" docker compose up -d --no-deps backend
  printf '%s\n' "${PREVIOUS}" > .current
  echo "!! 已回滚到 ${PREVIOUS}" >&2
else
  echo "!! 没有可回滚的版本，需人工处理" >&2
fi
exit 1
