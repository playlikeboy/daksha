// Phone: pick a WhatsApp chat export, photos and videos for a custom person, and send each file
// to its upload link. Not run on a device yet: typechecked only. See custom-people-pick.web.ts.
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { kindOf, type PickedFile, type RangeSender } from "./custom-people-data";

export async function pickPersonFiles(): Promise<{ files: PickedFile[]; skipped: number }> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/zip", "text/plain", "image/*", "video/*"],
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (result.canceled) return { files: [], skipped: 0 };
  const files: PickedFile[] = [];
  for (const asset of result.assets) {
    const kind = kindOf(asset.mimeType ?? "", asset.name);
    if (kind)
      files.push({
        name: asset.name,
        mimeType: kind.mimeType,
        sizeBytes: asset.size ?? new File(asset.uri).size ?? 0,
        kind: kind.kind,
        data: asset.uri,
      });
  }
  return { files, skipped: result.assets.length - files.length };
}

export const sendPersonRange: RangeSender = async (file, url, headers, from, to, onProgress) => {
  const uri = file.data as string;
  if (from === 0 && to >= file.sizeBytes) {
    const task = LegacyFileSystem.createUploadTask(
      url,
      uri,
      { httpMethod: "PUT", uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT, headers },
      (p) => onProgress(p.totalBytesSent),
    );
    const response = await task.uploadAsync();
    if (!response || response.status < 200 || response.status >= 300) throw new Error("The upload was refused. Try again.");
    return { etag: response.headers.ETag ?? response.headers.Etag ?? response.headers.etag };
  }
  const handle = new File(uri).open();
  try {
    handle.offset = from;
    const bytes = handle.readBytes(to - from);
    const response = await fetch(url, { method: "PUT", headers, body: bytes as unknown as BodyInit });
    if (!response.ok) throw new Error("The upload was refused. Try again.");
    onProgress(to - from);
    return { etag: response.headers.get("ETag") ?? undefined };
  } finally {
    handle.close();
  }
};
