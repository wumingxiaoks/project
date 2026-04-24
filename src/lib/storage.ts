import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';
import { env } from './env';

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

let bucketEnsured = false;
export async function ensureBucket() {
  if (bucketEnsured) return;
  let created = false;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
      created = true;
    } catch (err) {
      console.warn('[storage] createBucket failed:', err);
    }
  }
  if (created) {
    // Make objects publicly readable so provider APIs and browsers can fetch them.
    // For production you probably want presigned URLs instead.
    try {
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${env.S3_BUCKET}/*`],
          },
        ],
      };
      await s3.send(
        new PutBucketPolicyCommand({
          Bucket: env.S3_BUCKET,
          Policy: JSON.stringify(policy),
        }),
      );
    } catch (err) {
      console.warn('[storage] setBucketPolicy failed:', err);
    }
  }
  bucketEnsured = true;
}

export function buildPublicUrl(key: string): string {
  const base = (env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT).replace(/\/$/, '');
  return env.S3_FORCE_PATH_STYLE
    ? `${base}/${env.S3_BUCKET}/${key}`
    : `${base.replace('://', `://${env.S3_BUCKET}.`)}/${key}`;
}

export interface UploadResult {
  key: string;
  url: string;
  bytes: number;
  mimeType: string;
}

export async function uploadBuffer(
  buf: Buffer,
  opts: { mimeType: string; prefix?: string; ext?: string },
): Promise<UploadResult> {
  await ensureBucket();
  const ext = opts.ext ?? guessExt(opts.mimeType);
  const key = `${opts.prefix ?? 'uploads'}/${new Date()
    .toISOString()
    .slice(0, 10)}/${nanoid(16)}${ext}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: buf,
      ContentType: opts.mimeType,
    }),
  );
  return {
    key,
    url: buildPublicUrl(key),
    bytes: buf.byteLength,
    mimeType: opts.mimeType,
  };
}

export async function uploadFromUrl(
  url: string,
  opts: { prefix?: string } = {},
): Promise<UploadResult> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const mimeType = res.headers.get('content-type') ?? 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());
  return uploadBuffer(buf, { mimeType, prefix: opts.prefix ?? 'results' });
}

export async function presignGet(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    { expiresIn },
  );
}

function guessExt(mime: string): string {
  if (mime.includes('png')) return '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('mp3') || mime.includes('mpeg')) return '.mp3';
  if (mime.includes('wav')) return '.wav';
  return '';
}
