#!/usr/bin/env bash
# 主机侧发布：加锁、备份、切换到目标镜像、健康检查，失败回滚到上一版本。
set -euo pipefail
umask 077

cd "$(dirname "$0")"

TAG="${1:?用法: deploy.sh sha-abc1234}"
STAMP="$(date +%F-%H%M%S)"
PREVIOUS="$(cat .current 2>/dev/null || true)"
# 备份与日志步骤也会解析 compose 文件，给个占位值避免 "IMAGE_TAG 未设置" 的告警。
export IMAGE_TAG="${PREVIOUS:-unknown}"

exec 9>deploy.lock
flock -n 9 || { echo "另一个发布正在进行" >&2; exit 1; }

mkdir -p backup

if docker compose ps --status running --services 2>/dev/null | grep -qx mysql; then
  echo "==> 备份数据库与附件"
  docker compose exec -T mysql sh -c 'exec mysqldump --single-transaction --databases "$MYSQL_DATABASE" -uroot -p"$MYSQL_ROOT_PASSWORD"' \
    | gzip > "backup/db-${STAMP}.sql.gz"
  tar czf "backup/uploads-${STAMP}.tgz" -C /var/lib/jh-emp uploads
else
  echo "==> 数据库未运行，跳过备份"
fi

echo "==> 拉取 ${TAG}"
# 镜像名以 compose 文件为唯一来源。
IMAGE="$(docker compose config --images | grep '/jianheng-emp-server:')"
IMAGE="${IMAGE%:*}"
# 服务器到 ghcr.io 的大文件传输会被限速到近乎停滞，默认经加速源转取；失败则回退官方源。
MIRROR="${GHCR_MIRROR:-ghcr.nju.edu.cn}"
if docker pull -q "${MIRROR}/${IMAGE#ghcr.io/}:${TAG}"; then
  docker tag "${MIRROR}/${IMAGE#ghcr.io/}:${TAG}" "${IMAGE}:${TAG}"
  # 加速源的名字只是拉取时的临时别名，去掉以免同名镜像堆积。
  docker rmi "${MIRROR}/${IMAGE#ghcr.io/}:${TAG}" >/dev/null 2>&1 || true
else
  IMAGE_TAG="${TAG}" docker compose pull backend
fi

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
