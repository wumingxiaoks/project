# Video Gen Hub

一个自部署的、可调用多家 AI 视频生成 API 的统一前端。

**目标：** 用一张图（或一段文字/参考视频），通过统一界面调用 Replicate、Kling（可灵）、MiniMax Hailuo（海螺）等服务生成视频，统一存储、统一查看、统一对比。

## 特性

- **多 Provider 适配器**（Replicate / Kling / MiniMax Hailuo），易于扩展新的 Provider
- **统一的 `VideoProvider` 抽象**：`generate / getStatus / cancel / parseWebhook / testCredential`
- **Provider 凭证由前端管理**：每个 Provider 支持多个凭证，可设置默认、可"测试连通性"、可切换；**不用改 env、不用重启**
- **AES-256-GCM 加密存储**：所有密钥在写入数据库前加密（主密钥 `SECRETS_KEY`）
- **异步任务队列**（BullMQ + Redis），自动轮询 + 可选 webhook 回调
- **对象存储**（S3 / MinIO）：上传的图片和生成的视频都会落到自己的 bucket
- **Postgres + Drizzle ORM**：任务、资产、凭证的持久化
- **Next.js 15 (App Router)** 前端：上传、选模型、选凭证、查看任务进度、在线播放结果
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
# 1. 准备环境变量（基础设施配置，不含任何 provider key）
cp .env.example .env
# 必改：SECRETS_KEY（用于加密凭证）、WEBHOOK_SECRET

# 2. 启动全部服务
docker compose up -d --build

# 3. 打开 http://<your-server>:3000
#    → 右上角 Settings → 添加 Replicate / Kling / MiniMax 凭证
#    → 每个 provider 可以添加多条凭证（按账号/项目分开）
#    → 点 "Test" 一键验证 API 可用
#    → 回首页，创建任务时从下拉里选要用哪条凭证
#
# MinIO 控制台: http://<your-server>:9001   (minioadmin/minioadmin)
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

**Provider API key 不在 env 里配置**，所有凭证都通过前端 Settings 页面管理，AES-256-GCM 加密后存进数据库。

| 变量 | 说明 |
|---|---|
| `APP_BASE_URL` | 服务公网地址，用于生成 webhook 回调 URL |
| `WEBHOOK_SECRET` | 校验 provider webhook 回调 |
| `SECRETS_KEY` | **必须改**。加密凭证的主密钥（≥16 字符）。更换会导致已存凭证无法解密 |
| `DATABASE_URL` | Postgres |
| `REDIS_URL` | Redis |
| `S3_*` | S3 兼容对象存储（自部署推荐 MinIO） |

## 凭证管理

在首页右上角 **Settings** 里：

- 每个 Provider 可以添加 **多个凭证**（按账号 / 项目 / 环境分）
- 每条凭证可以 **设为默认**（创建任务时默认被选中）
- 每条凭证都有 **Test** 按钮：调用该 provider 的一个廉价鉴权接口（Replicate `/v1/account`、Kling 列任务、MiniMax 列文件）实时验证
- 密钥字段（Secret Key / API Token / API Key）以 `r8_t••••34` 形式回显，不会明文再显示
- 编辑时 **Secret 字段留空 = 保留原值**

每家需要的字段由 Provider 描述（`credentialFields`），前端自动渲染：

| Provider | 字段 |
|---|---|
| Replicate | `apiToken` |
| Kling | `accessKey`, `secretKey`, `apiBase`（默认 Singapore） |
| MiniMax | `apiKey`, `groupId`（可选）, `apiBase` |

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
  /** 告诉前端要渲染哪些输入框，哪些是 secret */
  credentialFields: CredentialFieldSpec[];
  generate(input: GenerateInput): Promise<{ providerTaskId: string }>;
  getStatus(taskId: string, credential: CredentialPayload): Promise<TaskStatus>;
  cancel?(taskId: string, credential: CredentialPayload): Promise<void>;
  parseWebhook?(headers, body): Promise<{ providerTaskId, status } | null>;
  /** 前端 "Test" 按钮会调到这里做实时鉴权 */
  testCredential(credential: CredentialPayload): Promise<{ ok: boolean; message: string }>;
}
```

凭证在运行时以 `CredentialPayload` 形式传入：

```ts
interface CredentialPayload {
  id: string;
  provider: ProviderId;
  label: string;
  config: Record<string, string | undefined>;   // 非 secret：apiBase 等
  secrets: Record<string, string | undefined>;  // secret：apiToken / secretKey 等
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
│   │   │   ├── credentials/    # 凭证 CRUD + /test
│   │   │   ├── jobs/           # 任务 CRUD
│   │   │   ├── uploads/        # 图片上传到 S3
│   │   │   ├── providers/      # Provider 元数据（含 credentialFields）
│   │   │   └── webhooks/       # provider 回调
│   │   ├── settings/           # 凭证管理页面
│   │   ├── jobs/               # 任务列表 + 详情
│   │   └── page.tsx            # 首页
│   ├── components/             # React 组件
│   └── lib/
│       ├── db/                 # Drizzle schema / client / migrator
│       ├── providers/          # Provider 适配器（核心）
│       ├── credentials.ts      # 凭证增删改查 + 解密/加密封装
│       ├── crypto.ts           # AES-256-GCM
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
