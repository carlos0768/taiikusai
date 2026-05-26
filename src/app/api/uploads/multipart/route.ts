import { NextResponse } from "next/server";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireAuth } from "@/lib/server/auth";
import { toErrorResponse, HttpError } from "@/lib/server/errors";

const BUCKET = "uploads";
const PART_URL_TTL = 60 * 60; // 1h

function s3(): S3Client {
  const endpoint = process.env.SUPABASE_S3_ENDPOINT;
  const region = process.env.SUPABASE_S3_REGION;
  const accessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY;

  if (!endpoint || !region || !accessKeyId || !secretAccessKey) {
    throw new HttpError(
      500,
      "S3 アップロードが未設定です (SUPABASE_S3_* 環境変数を設定してください)"
    );
  }

  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

function safeExt(name: string, contentType: string): string {
  const fromName = name.split(".").pop();
  if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/i.test(fromName)) {
    return fromName.toLowerCase();
  }
  const fromType = contentType.split("/")[1];
  return (fromType || "bin").toLowerCase();
}

export async function POST(request: Request) {
  try {
    await requireAuth();

    const body = await request.json();
    const action = body?.action as string;
    const client = s3();

    if (action === "create") {
      const { fileName, contentType, partCount } = body as {
        fileName: string;
        contentType?: string;
        partCount: number;
      };
      if (!partCount || partCount < 1 || partCount > 10000) {
        throw new HttpError(400, "partCount が不正です");
      }

      const type = contentType || "application/octet-stream";
      const uuid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const key = `${uuid}.${safeExt(fileName || "", type)}`;

      const created = await client.send(
        new CreateMultipartUploadCommand({
          Bucket: BUCKET,
          Key: key,
          ContentType: type,
          CacheControl: "3600",
        })
      );
      const uploadId = created.UploadId!;

      const partUrls = await Promise.all(
        Array.from({ length: partCount }, (_, i) =>
          getSignedUrl(
            client,
            new UploadPartCommand({
              Bucket: BUCKET,
              Key: key,
              UploadId: uploadId,
              PartNumber: i + 1,
            }),
            { expiresIn: PART_URL_TTL }
          )
        )
      );

      return NextResponse.json({ key, uploadId, partUrls });
    }

    if (action === "complete") {
      const { key, uploadId } = body as { key: string; uploadId: string };
      if (!key || !uploadId) throw new HttpError(400, "key/uploadId が必要です");

      // ETag はブラウザの CORS で読めないことがあるため、サーバー側で
      // ListParts して確実に収集してから complete する
      const listed = await client.send(
        new ListPartsCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId })
      );
      const parts = (listed.Parts ?? [])
        .map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag }))
        .sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0));
      if (parts.length === 0) throw new HttpError(400, "パートがありません");

      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: BUCKET,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        })
      );

      const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
      const url = `${base}/storage/v1/object/public/${BUCKET}/${key}`;
      return NextResponse.json({ url, path: key });
    }

    if (action === "abort") {
      const { key, uploadId } = body as { key: string; uploadId: string };
      if (key && uploadId) {
        await client.send(
          new AbortMultipartUploadCommand({
            Bucket: BUCKET,
            Key: key,
            UploadId: uploadId,
          })
        );
      }
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "未知の action です");
  } catch (error) {
    return toErrorResponse(error);
  }
}
