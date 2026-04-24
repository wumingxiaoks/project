# Video Gen Hub

一个自部署的、可调用多家 AI 视频生成 API 的统一前端。

**目标：** 用一张图（或一段文字/参考视频），通过统一界面调用 Replicate、Kling（可灵）、MiniMax Hailuo（海螺）等服务生成视频，统一存储、统一查看、统一对比。

## 特性

- **多 Provider 适配器**（Replicate / Kling / MiniMax Hailuo），易于扩展新的 Provider
- **统一的 `VideoProvider` 抽象**：`generate / getStatus / cancel / parseWebhook`
- **异步任务队列**（BullMQ + Redis），自动轮询 + 可选 webhook 回调
- **对象存储**（S3 / MinIO）：上传的图片和生成的视频都会落到自己的 bucket
- **Postgres + Drizzle ORM**：任务、资产的持久化
- **Next.js 15 (App Router)** 前端：上传、选模型、查看任务进度、在线播放结果
- **Docker Compose** 一键拉起 Web + Worker + Postgres + Redis + MinIO

## 架构

```
┌─ Browser ─────────────────────────────────────────┐
│  Next.js (upload / model picker / job list)       │
└──────────┬─────────────────────────────┬──────────┘
           │ fetch                       │ fetch
           ▼                             ▼
┌─ Next.js API Routes ─────────┐   ┌─ BullMQ Worker ─┐
│  /api/uploads                │   │  start → call   │
│  /api/jobs                   │   │  provider API   │
│  /api/webhooks/[provider]    │   │  poll → status  │
└───┬─────────────────┬────────┘   └────────┬────────┘
    │                 │                     │
    ▼                 ▼                     ▼
┌─ MinIO/S3 ─┐  ┌─ Postgres ─┐         ┌─ Redis ─┐
│ images     │  │ jobs       │         │ BullMQ  │
│ videos     │  │ assets     │         │ queue   │
└────────────┘  └────────────┘         └─────────┘
                                              │
                       ┌──────────────────────┼──────────────────────┐
                       ▼                      ▼                      ▼
                  Replicate API           Kling API              MiniMax API
```

## 快速开始（Docker Compose，推荐）

```bash
# 1. 准备环境变量
cp .env.example .env
# 编辑 .env，填入你的 provider API key（至少配一家才能真跑起来）

# 2. 启动全部服务
docker compose up -d --build

# 3. 打开
#    应用:      http://<your-server>:3000
#    MinIO 控制台: http://<your-server>:9001   (minioadmin/minioadmin)
```

首次启动会自动：
- 创建 Postgres 数据库并跑迁移（`migrate` 服务）
- 创建 MinIO bucket 并设为公开可读（`minio-init`）
- 启动 Web + Worker

## 本地开发

```bash
pnpm install
cp .env.example .env     # 改为 localhost 地址
# 启动依赖：
docker compose up -d postgres redis minio minio-init
# 或者分别启动本地 Postgres/Redis/MinIO，把 .env 里端口对上
pnpm db:migrate
pnpm dev          # 前端 + API
pnpm worker       # 另开一个终端跑任务 worker
```

## 环境变量

见 [`.env.example`](./.env.example)。核心变量：

| 变量 | 说明 |
|---|---|
| `APP_BASE_URL` | 服务公网地址，用于生成 webhook 回调 URL |
| `WEBHOOK_SECRET` | 校验 provider webhook 回调 |
| `DATABASE_URL` | Postgres |
| `REDIS_URL` | Redis |
| `S3_*` | S3 兼容对象存储（自部署推荐 MinIO） |
| `REPLICATE_API_TOKEN` | [Replicate](https://replicate.com/account/api-tokens) |
| `KLING_ACCESS_KEY` / `KLING_SECRET_KEY` | [Kling 开放平台](https://app.klingai.com/global/dev-center)，JWT 签名用 |
| `MINIMAX_API_KEY` / `MINIMAX_GROUP_ID` | [MiniMax](https://platform.minimaxi.com) |

未配置的 provider 在前端会显示为灰色且不可选，不会影响其他 provider 使用。

## 添加新的 Provider

1. 在 `src/lib/providers/` 下新建 `yourprovider.ts`，实现 `VideoProvider` 接口
2. 在 `src/lib/providers/index.ts` 注册
3. 在 `src/lib/db/schema.ts` 的 `providerEnum` 里加上新 id，重新生成迁移
4. 完成

`VideoProvider` 接口：

```ts
interface VideoProvider {
  id: ProviderId;
  name: string;
  models: ModelDescriptor[];
  isConfigured(): boolean;
  generate(input: GenerateInput): Promise<{ providerTaskId: string }>;
  getStatus(providerTaskId: string): Promise<TaskStatus>;
  cancel?(providerTaskId: string): Promise<void>;
  parseWebhook?(headers, body): Promise<{ providerTaskId, status } | null>;
}
```

## 任务生命周期

1. 用户上传图片 → 存入 S3，写 `assets` 表
2. 用户点 Generate → `/api/jobs` 写 `jobs` 表（状态 `queued`）→ 入队 BullMQ
3. Worker 取到 `start` job → 调 provider `generate()` → 写回 `provider_task_id`（状态 `running`）
4. Worker 每 5~30s 入队一个 `poll` job 拉取进度；provider 推 webhook 时也会更新
5. 完成后把视频 **镜像到自己的 S3**（provider 的 URL 通常有时效），写 `output_asset_id`

## 目录结构

```
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes
│   │   ├── jobs/               # 列表 + 详情页
│   │   └── page.tsx            # 首页（创建 + 最近任务）
│   ├── components/             # React 组件
│   └── lib/
│       ├── db/                 # Drizzle schema / client / migrator
│       ├── providers/          # Provider 适配器（核心）
│       ├── env.ts              # env 校验
│       ├── jobs.ts             # 任务状态机
│       ├── queue.ts            # BullMQ
│       └── storage.ts          # S3 / MinIO 客户端
├── worker/
│   └── index.ts                # BullMQ Worker 入口
├── drizzle/                    # SQL 迁移
├── Dockerfile                  # 多阶段（web / worker / migrate）
└── docker-compose.yml
```

## 注意事项 / 坑点

- **网络**：Kling/MiniMax 的 API 国内可直连；Replicate 在国内需要稳定海外出口
- **Webhook**：要让 provider 能回调你的服务，`APP_BASE_URL` 必须是 **公网可达** 的地址。开发阶段可以配 `ngrok` / `cloudflared`；没配 webhook 也没关系，worker 会轮询
- **MinIO 公开访问**：默认会把 bucket 设为公开只读，方便 provider 拉取你上传的图片。生产建议改为预签名 URL（`presignGet` 已经准备好）
- **商用合规**：各家 API 的 ToS 大多禁止"API 再分发"给第三方终端用户；自己或公司内部用没问题，对外卖之前先读条款
- **Viggle、Sora** 目前无公开 API；如果需要可用 **Replicate** 上的开源复刻方案（Animate Anyone / MimicMotion）

## 脚本

| 命令 | 说明 |
|---|---|
| `pnpm dev` | Next.js 开发服务 |
| `pnpm build` / `pnpm start` | 生产构建/启动 |
| `pnpm worker` | BullMQ worker（开发） |
| `pnpm db:generate` | 根据 schema 生成迁移 |
| `pnpm db:migrate` | 应用迁移 |
| `pnpm db:studio` | 打开 Drizzle Studio |

## License

MIT
