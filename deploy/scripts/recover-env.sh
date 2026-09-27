#!/usr/bin/env bash
# กู้ไฟล์ env/*.env ที่หายไป โดยดึงค่ากลับจาก container ที่ยังอยู่ (รันอยู่หรือหยุดแล้วก็ได้ แต่ต้องยังไม่ถูกลบ)
# container เก็บค่าจาก env_file ไว้ตอนสร้าง: ค่า env ของ container − ค่าที่มากับ image = ค่าจากไฟล์ของเรา
# วิธีใช้: ./scripts/recover-env.sh          (สร้างเฉพาะไฟล์ที่หาย/ว่าง ไม่เขียนทับไฟล์ที่มีอยู่)
# ⚠ ห้ามสั่ง deploy/rollback/docker compose up/down ก่อนกู้เสร็จ — container ใหม่จะไม่มีค่าเหล่านี้
# ไม่ source lib.sh เพราะ lib.sh หยุดทำงานเมื่อไฟล์ env หาย; แสดงเฉพาะจำนวนบรรทัด ไม่แสดงค่า (มี secret)
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="msu-club-prod"
umask 077
mkdir -p "$APP_DIR/env"

status=0
for svc in postgres garage api web; do
  out="$APP_DIR/env/$svc.env"
  if [[ -s "$out" ]]; then
    echo "env/$svc.env: มีอยู่แล้ว ไม่แตะ"
    continue
  fi
  cid="$(docker ps -a -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=$svc" | head -1)"
  if [[ -z "$cid" ]]; then
    echo "env/$svc.env: ไม่พบ container ของ $svc — ต้องกู้จาก backup (env.tgz) หรือสร้างใหม่ (docs/deployment.md หัวข้อ 8)" >&2
    status=1
    continue
  fi
  image="$(docker inspect -f '{{.Image}}' "$cid")"
  comm -23 \
    <(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cid" | sort) \
    <(docker image inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$image" | sort) \
    | grep -v '^$' > "$out" || true
  # ค่าที่ตรงกับค่าของ image จะถูกตัดออกด้วย (เช่น NODE_ENV=production ของ api) ใส่กลับเพื่อให้อ่านไฟล์แล้วเข้าใจตรงกัน
  if [[ "$svc" == "api" ]] && ! grep -q '^NODE_ENV=' "$out"; then echo 'NODE_ENV=production' >> "$out"; fi
  chmod 600 "$out"
  echo "env/$svc.env: กู้แล้ว $(grep -c . "$out") บรรทัด"
done

if [[ $status -eq 0 ]]; then
  echo "เสร็จ — ตรวจต่อด้วย: docker compose config -q && ./scripts/backup.sh after-recover"
fi
exit $status
