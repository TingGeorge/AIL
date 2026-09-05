import busboy from "busboy";
import { MAX_AUDIO_BYTES } from "./voice.ts";

export class VoiceUploadError extends Error {
  constructor(public readonly kind: "invalid" | "too_large") {
    super("Invalid audio upload");
  }
}

// Bun 1.4 Request.formData() can replace a part's audio Content-Type with a
// filename-derived video MIME. Read the declared part header, never infer it
// from the untrusted filename. Parsing and audio bytes stay in memory only.
export async function readVoiceUpload(request: Request): Promise<{ bytes: Uint8Array; type: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new VoiceUploadError("invalid");
  // Independently cap the stream, including when a caller supplies Content-Length.
  if (!request.body) throw new VoiceUploadError("invalid");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 6 * 1024 * 1024) throw new VoiceUploadError("too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return new Promise((resolve, reject) => {
    const invalid = () => reject(new VoiceUploadError("invalid"));
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({ headers: { "content-type": contentType }, limits: {
        files: 1, fields: 0, parts: 2, fileSize: MAX_AUDIO_BYTES + 1,
      } });
    } catch { invalid(); return; }
    let upload: { bytes: Uint8Array; type: string } | undefined;
    parser.on("file", (name, stream, info) => {
      if (name !== "audio") { stream.resume(); invalid(); return; }
      const audio: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => audio.push(chunk));
      stream.on("limit", () => reject(new VoiceUploadError("too_large")));
      stream.on("error", invalid);
      stream.on("end", () => { upload = { bytes: Buffer.concat(audio), type: info.mimeType }; });
    });
    parser.on("filesLimit", invalid);
    parser.on("fieldsLimit", invalid);
    parser.on("partsLimit", invalid);
    parser.on("error", invalid);
    parser.on("close", () => upload ? resolve(upload) : invalid());
    parser.end(Buffer.concat(chunks));
  });
}
