// Web: pick a WhatsApp chat export, photos and videos for a custom person, and send each file
// to its upload link. The phone version is custom-people-pick.native.ts; both export the same names.
import { kindOf, type PickedFile, type RangeSender } from "./custom-people-data";

/** Open the browser's file picker for several files. Files Daksha can't use are left out and counted. */
export function pickPersonFiles(): Promise<{ files: PickedFile[]; skipped: number }> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".zip,.txt,text/plain,application/zip,image/jpeg,image/png,image/webp,image/gif,video/*";
    input.style.display = "none";
    const cleanup = () => input.remove();
    input.onchange = () => {
      const picked = Array.from(input.files ?? []);
      cleanup();
      const files: PickedFile[] = [];
      for (const file of picked) {
        const kind = kindOf(file.type, file.name);
        if (kind) files.push({ name: file.name, mimeType: kind.mimeType, sizeBytes: file.size, kind: kind.kind, data: file });
      }
      resolve({ files, skipped: picked.length - files.length });
    };
    input.oncancel = () => {
      cleanup();
      resolve({ files: [], skipped: 0 });
    };
    document.body.appendChild(input);
    input.click();
  });
}

/** Send bytes [from, to) of a picked file to an upload link. */
export const sendPersonRange: RangeSender = (file, url, headers, from, to, onProgress) =>
  new Promise((resolve, reject) => {
    const blob = (file.data as Blob).slice(from, to);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ etag: xhr.getResponseHeader("ETag") ?? undefined });
      else reject(new Error("The upload was refused. Try again."));
    };
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    xhr.ontimeout = xhr.onerror;
    xhr.send(blob);
  });
