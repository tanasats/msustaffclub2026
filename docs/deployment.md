# การ deploy ระบบขึ้น production

คู่มือ deploy ระบบบริหารจัดการชมรมบุคลากร บน VM (Ubuntu + Docker + nginx) ที่ `https://club.msu.ac.th`
ไฟล์ที่ใช้จริงอยู่ในโฟลเดอร์ `deploy/` และ `.github/workflows/` ของ repo

---

## 1. ภาพรวมสถาปัตยกรรม

```
                        ผู้ใช้ (HTTPS 443) → https://club.msu.ac.th
                                   │
                ┌──────────────────┴───────────────────┐
                │ nginx บน host  (ใบรับรอง *.msu.ac.th)    │
                └───┬───────────────┬──────────────┬───┘
                 /  │         /api/ │ (ตัด /api)   │ /club-files/ (path + Host เดิม)
                    ▼               ▼              ▼
             ┌────────────┐  ┌────────────┐  ┌────────────┐
             │ web :3000  │─▶│ api :4000  │─▶│ garage     │   docker compose (โปรเจกต์ msu-club-prod)
             │ Next.js    │  │ Express    │  │ S3 :3900   │   port ทั้งหมด bind ที่ 127.0.0.1
             └────────────┘  └─────┬──────┘  └────────────┘
               API_URL=http://api:4000       ▼
                             ┌────────────┐
                             │ postgres   │   ไม่เปิด port ออก host
                             └────────────┘
```

| ทาง | ไปที่ | หมายเหตุ |
|---|---|---|
| `/` | web (Next.js) | Server Component เรียก API ภายใน docker network |
| `/api/*` | api (Express) | nginx ตัด `/api` ออก: `/api/auth/me` → `/auth/me` |
| `/club-files/*` | Garage (S3) | presigned URL ของ browser — nginx ส่ง path และ Host **เดิมทุกตัวอักษร** |

## 2. การตัดสินใจหลัก (ยืนยันแล้ว)

| เรื่อง | ที่เลือก | เหตุผล |
|---|---|---|
| โดเมน | `club.msu.ac.th` โดเมนเดียวสำหรับ web, API และไฟล์ | cookie session แบบ host-only ส่งถึงทั้ง web และ API, ไม่ต้องมี CORS, ใช้ใบรับรอง wildcard `*.msu.ac.th` ชั้นเดียวได้ |
| ไฟล์ (Garage) | path-style ใต้โดเมนเดียวกัน: `https://club.msu.ac.th/club-files/<key>` | ไม่ต้องขอ DNS/ใบรับรองเพิ่ม; ชื่อ bucket (`club-files`) เป็น prefix ของ path พอดี nginx จึงส่งต่อได้โดยไม่แก้ path ลายเซ็นจึงตรง; same-origin จึงไม่ต้องตั้ง CORS ของ bucket |
| ใบรับรอง TLS | ใบของมหาวิทยาลัย (`*.msu.ac.th`) | |
| การ build | GitHub Actions → image ที่ GHCR แท็ก `sha-<commit 7 ตัว>` | VM ออกอินเทอร์เน็ตได้; VM ไม่ต้องมี Node/pnpm; rollback = เปลี่ยนแท็ก |
| การสั่ง deploy | บน VM: `./scripts/deploy.sh sha-xxxxxxx` (pull-based) | ไม่ต้องเปิด SSH ให้ GitHub; คนสั่ง deploy ตั้งใจทำเอง |
| Migration | container ครั้งเดียวจาก image api เวอร์ชันใหม่ **ก่อน** สลับ | migrate ล้ม → เวอร์ชันเดิมยังทำงานต่อ |
| ปลายทาง backup นอก VM | **ยังไม่กำหนด** (NAS หรือเครื่องอื่นในเครือข่าย) | สคริปต์รองรับแล้ว เพียงตั้ง `BACKUP_REMOTE` |

## 3. การแก้โค้ดเพื่อรองรับ production (ทำแล้ว)

| เรื่อง | ไฟล์ | รายละเอียด |
|---|---|---|
| path ของ OAuth cookie | `apps/api/src/config/derive.ts`, `routes/auth.ts` | เดิมฮาร์ดโค้ด `/auth/google` → login ล้มเมื่อ API อยู่ใต้ `/api`; ตอนนี้คำนวณจาก `GOOGLE_REDIRECT_URI` |
| `trust proxy` | `apps/api/src/app.ts`, env `TRUST_PROXY` | หลัง nginx ต้องตั้ง `1` ไม่เช่นนั้น rate limit ของ `/auth/*` นับทุกคนเป็น IP เดียว; ห้าม `true` (ปลอม IP ได้) |
| สคริปต์ใน image | `apps/api/tsconfig.build.json` | คอมไพล์ `scripts/` ด้วย (seed super_admin) → `dist/src/server.js`, `dist/scripts/*.js` |
| Next.js standalone | `apps/web/next.config.ts` | image เล็ก รันด้วย `node apps/web/server.js` |
| env ของ web | `apps/web/src/lib/server-env.ts`, `src/instrumentation.ts` | อ่าน env ตอนใช้งาน (build ได้โดยไม่มี env production) และตรวจครบตอนเริ่ม server |

## 4. ไฟล์ใน repo

```
apps/api/Dockerfile           image API (node:24 alpine, user node, มี migrations ในตัว)
apps/web/Dockerfile           image web (standalone) — ต้องระบุ --build-arg NEXT_PUBLIC_API_URL
.dockerignore                 กัน .env / node_modules เข้า image
.github/workflows/ci.yml      ทุก PR: lint, typecheck, test (PostgreSQL + Garage จริง)
.github/workflows/release.yml merge เข้า main: CI ซ้ำ → build + push image api/web ไป GHCR
deploy/                       ← คัดลอกทั้งโฟลเดอร์ไปเป็น /opt/msu-club บน VM
  compose.yml                 postgres, garage, api, web, migrate (profile tools)
  garage.toml                 config Garage production
  nginx/msu-club.conf         site ของ nginx บน host
  env/*.env.example           แม่แบบไฟล์ env (api, web, postgres, garage, deploy)
  scripts/deploy.sh           backup → pull → migrate → สลับ → ตรวจสุขภาพ (ไม่ผ่าน = กลับเวอร์ชันเดิมอัตโนมัติ)
  scripts/rollback.sh         กลับไปเวอร์ชันก่อนหน้า
  scripts/backup.sh           pg_dump + snapshot Garage + ลบของเก่า + rsync ออกนอก VM
  scripts/garage-setup.sh     สร้าง key + bucket (private) แล้วเขียน key ลง env/api.env
```

## 5. เตรียม VM ครั้งแรก (ทำครั้งเดียว)

> ทดสอบขั้นตอน 5–8 แบบจำลองบนเครื่อง dev แล้ว (nginx + compose + registry จำลอง): หน้าเว็บ, `/api`, OAuth cookie, อัปโหลด/ดาวน์โหลดไฟล์ผ่าน `/club-files/`, backup + restore, deploy, rollback อัตโนมัติ

**5.1 ฝั่ง GitHub**
1. merge PR ที่มีไฟล์ชุดนี้เข้า `main` → workflow **Release** จะ build image ครั้งแรก (ดูแท็กในหน้า Actions → Summary)
2. (ถ้าต้องการเปลี่ยน URL ของ API) Settings → Secrets and variables → Actions → Variables: `NEXT_PUBLIC_API_URL`
3. สร้าง Personal Access Token (classic) สิทธิ์ `read:packages` เท่านั้น สำหรับให้ VM ดึง image (image บน GHCR เป็น private ตามค่าเริ่มต้น)

**5.2 ฝั่ง Google Cloud Console** (OAuth client ของระบบ)
- Authorized redirect URI: `https://club.msu.ac.th/api/auth/google/callback`
- Authorized JavaScript origin: `https://club.msu.ac.th`

**5.3 ฝั่ง VM**
```bash
# ผู้ใช้และโฟลเดอร์
sudo adduser --disabled-password deploy && sudo usermod -aG docker deploy
sudo mkdir -p /opt/msu-club && sudo chown deploy:deploy /opt/msu-club
# คัดลอกโฟลเดอร์ deploy/ จาก repo (เช่น git clone แล้ว cp -r deploy/. /opt/msu-club/)
# ⚠ ทุกไฟล์ใน /opt/msu-club ต้องเป็นของผู้ใช้ที่รันสคริปต์ (ห้ามสร้างด้วย sudo) — ถ้าเผลอ:
#   sudo chown -R $(id -un):$(id -gn) /opt/msu-club

cd /opt/msu-club
cp env/deploy.env.example .env
for f in api web postgres garage; do cp env/$f.env.example env/$f.env; done
chmod 600 .env env/*.env
# กรอกค่า: รหัสผ่าน DB และ secret ของ Garage สุ่มด้วย  openssl rand -hex 32
#          DATABASE_URL ใน env/api.env ใช้รหัสผ่านเดียวกับ env/postgres.env
#          GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / INITIAL_SUPER_ADMIN_EMAIL

echo '<PAT read:packages>' | docker login ghcr.io -u <github-user> --password-stdin

# ฐานข้อมูลและ storage
sed -i 's/^APP_TAG=.*/APP_TAG=sha-xxxxxxx/' .env      # แท็กจากขั้น 5.1
docker compose up -d postgres garage
./scripts/garage-setup.sh                              # สร้าง bucket club-files + เขียน key ลง env/api.env

# deploy ครั้งแรก (migrate ทั้งหมด + เปิด api/web)
./scripts/deploy.sh sha-xxxxxxx
```

**5.4 nginx**
```bash
# วางไฟล์ใบรับรองของมหาวิทยาลัยให้ตรงกับ path ใน msu-club.conf (crt ต้องรวม intermediate chain)
sudo cp deploy/nginx/msu-club.conf /etc/nginx/sites-available/msu-club.conf
sudo ln -s /etc/nginx/sites-available/msu-club.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**5.5 super_admin คนแรก**: เจ้าของ `INITIAL_SUPER_ADMIN_EMAIL` เข้าสู่ระบบด้วย Google 1 ครั้ง แล้ว
```bash
docker compose run --rm api node dist/scripts/seed-super-admin.js
```

**5.6 สำรองข้อมูลอัตโนมัติ** (`crontab -e` ของผู้ใช้ deploy)
```
0 2 * * * /opt/msu-club/scripts/backup.sh daily >> /opt/msu-club/backups/cron.log 2>&1
```

**5.7 Firewall**: เปิดเฉพาะ 22 (จำกัด IP ถ้าทำได้), 80, 443

## 6. Workflow การ deploy แต่ละครั้ง

```
 developer           GitHub                                   VM (/opt/msu-club)
 ─────────           ──────                                   ─────────────────
 feature/* ──PR──▶   CI: lint + typecheck + test
                     (ผ่านแล้วจึง merge)
          merge ──▶  Release: CI ซ้ำ → build api/web
                     → ghcr.io/tanasats/msustaffclub2026-{api,web}:sha-abc1234
                                                              ./scripts/deploy.sh sha-abc1234
                                                               1. backup (pre-sha-abc1234)
                                                               2. pull image    ── ล้ม → หยุด ไม่เปลี่ยนอะไร
                                                               3. migrate       ── ล้ม → หยุด เวอร์ชันเดิมยังทำงาน
                                                               4. สลับ api/web + รอ healthy
                                                                  └ ไม่ผ่าน → กลับเวอร์ชันเดิมอัตโนมัติ
                                                               5. บันทึกลง deployed.log
```

1. merge PR เข้า `main` → รอ **Release** เสร็จ → ดูแท็กใน Summary (เช่น `sha-abc1234`)
2. `ssh deploy@<vm>` → `cd /opt/msu-club && ./scripts/deploy.sh sha-abc1234`
3. ตรวจด้วยตา: หน้าแรก, login, เปิดหน้าชมรม, อัปโหลดรูป 1 ครั้ง
4. ถ้า PR นั้นแก้ไฟล์ใน `deploy/` (compose, nginx, สคริปต์) ต้องคัดลอกไฟล์ที่เปลี่ยนไปที่ VM ด้วย

downtime ระหว่างสลับ container ไม่กี่วินาที (ยอมรับได้สำหรับระบบภายใน)

## 7. Rollback

- `./scripts/rollback.sh` → กลับไปแท็กก่อนหน้าใน `deployed.log` (หรือระบุ: `./scripts/rollback.sh sha-xxxx`)
- rollback **ไม่ย้อน migration** — migration ของโปรเจกต์นี้เพิ่มตาราง/คอลัมน์เป็นหลัก โค้ดเวอร์ชันเก่าจึงมักทำงานกับ schema ใหม่ได้
- ถ้าต้องย้อน schema จริง → restore จาก backup `pre-<แท็ก>` ที่ deploy.sh สร้างไว้ (หัวข้อ 8) — ไม่ใช้ `migrate down` บน production
- หลักการเขียน migration ต่อจากนี้: ลบ/เปลี่ยนชื่อคอลัมน์ให้แบ่ง 2 รอบ deploy (รอบแรกเลิกใช้ในโค้ด รอบถัดไปจึงลบ)

## 8. สำรองและกู้คืนข้อมูล

`scripts/backup.sh` สร้าง `backups/<เวลา>-<ป้าย>/`
- `db.dump` — `pg_dump -Fc` (บีบอัด, restore บางตารางได้)
- `garage.tgz` — snapshot metadata ของ Garage (ไฟล์เล็กเก็บใน metadata) + โฟลเดอร์ data (ไฟล์ใหญ่)

ลบชุดที่เก่ากว่า `BACKUP_KEEP_DAYS` (14 วัน) และถ้ากำหนด `BACKUP_REMOTE` จะ `rsync` ออกนอก VM
**ตอนนี้ยังไม่กำหนดปลายทาง — backup อยู่บน VM เดียวกับระบบ (สคริปต์จะเตือนทุกครั้ง) ควรกำหนดก่อนเปิดใช้จริง**
ตัวอย่าง: `BACKUP_REMOTE=backup@nas.msu.ac.th:/backups/msu-club` (ตั้ง SSH key ของผู้ใช้ deploy ให้เข้าได้โดยไม่ถามรหัสผ่าน)

**กู้คืนฐานข้อมูล**
```bash
cd /opt/msu-club
docker compose stop api web
docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < backups/<ชุด>/db.dump
docker compose up -d api web
```

**กู้คืนไฟล์ (Garage)**
```bash
docker compose stop garage
# แตก garage.tgz ลง volume: data/ → garage_data, meta/snapshots/<เวลา>/ → วางแทน metadata (ดูคู่มือ Garage: "Recovering from failures")
docker compose start garage
```

ทดลองกู้คืนลงเครื่องทดสอบอย่างน้อยเดือนละครั้ง

## 9. Checklist ก่อนเปิดใช้จริง

- [ ] `NODE_ENV=production` (cookie ได้ `Secure`), `TRUST_PROXY=1`
- [ ] secret ทุกตัวสุ่มใหม่ ไม่ใช้ค่าจาก dev; ไฟล์ env สิทธิ์ `600`
- [ ] redirect URI ของ Google ตรงทุกตัวอักษร, OAuth consent screen เป็น Internal
- [ ] `docker compose ps` — postgres ไม่มี port ออก host, ที่เหลือเป็น `127.0.0.1:` เท่านั้น
- [ ] ใบรับรองรวม intermediate chain (ตรวจ: `openssl s_client -connect club.msu.ac.th:443 -servername club.msu.ac.th`)
- [ ] cron backup ทำงาน และกำหนด `BACKUP_REMOTE` แล้ว
- [ ] ทดลอง restore อย่างน้อย 1 ครั้ง
- [ ] super_admin คนแรกเข้าใช้ได้

## 10. เรื่องที่ยังเปิดอยู่

1. ปลายทาง backup นอก VM (`BACKUP_REMOTE`)
2. การแจ้งเตือนเมื่อระบบล่ม (เช่น uptime monitor เรียก `https://club.msu.ac.th/api/health`)
