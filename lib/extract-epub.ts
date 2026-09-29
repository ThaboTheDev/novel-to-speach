/**
 * EPUB text extraction. An EPUB is a ZIP archive of XHTML documents;
 * we read the spine order from the OPF package file and strip markup.
 */

import { normalizeText, stripMarkup } from "./text-extract";

const decoder = new TextDecoder("utf-8");

interface ManifestItem {
  href: string;
}

/** Join a relative path against a base directory inside the archive. */
function joinPath(base: string, href: string): string {
  if (href.startsWith("/")) return href.slice(1);
  const parts = (base ? base.split("/") : []).filter(Boolean);
  for (const seg of href.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

export async function extractEpub(data: ArrayBuffer): Promise<string> {
  const { unzipSync } = await import("fflate");
  const files = unzipSync(new Uint8Array(data));

  // 1) Locate the OPF package document via META-INF/container.xml
  const containerBytes = files["META-INF/container.xml"];
  if (!containerBytes) throw new Error("Not a valid EPUB (missing container.xml).");
  const container = decoder.decode(containerBytes);
  const opfPath = container.match(/full-path=["']([^"']+)["']/)?.[1];
  if (!opfPath) throw new Error("Not a valid EPUB (no package document).");

  const opfBytes = files[opfPath];
  if (!opfBytes) throw new Error("Not a valid EPUB (package document missing).");
  const opf = decoder.decode(opfBytes);
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";

  // 2) Manifest: id → href for XHTML documents
  const manifest = new Map<string, ManifestItem>();
  for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
    const tag = m[0];
    const id = tag.match(/\bid=["']([^"']+)["']/)?.[1];
    const href = tag.match(/\bhref=["']([^"']+)["']/)?.[1];
    const mediaType = tag.match(/media-type=["']([^"']+)["']/)?.[1] ?? "";
    if (id && href && (mediaType.includes("xhtml") || mediaType.includes("html") || /\.(x?html?)$/i.test(href))) {
      const decodedHref = href.replace(/&amp;/g, "&");
      manifest.set(id, { href: decodeURIComponent(decodedHref) });
    }
  }

  // 3) Spine order
  const spineIds: string[] = [];
  for (const m of opf.matchAll(/<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*>/g)) {
    if (/\blinear=["']no["']/.test(m[0])) continue; // skip non-linear (e.g. cover)
    spineIds.push(m[1]);
  }
  const ordered = spineIds.length > 0 ? spineIds : [...manifest.keys()];

  // 4) Extract chapters in reading order
  const chapters: string[] = [];
  for (const id of ordered) {
    const item = manifest.get(id);
    if (!item) continue;
    const path = joinPath(opfDir, item.href);
    const bytes = files[path];
    if (!bytes) continue;
    const chapterText = normalizeText(stripMarkup(decoder.decode(bytes)));
    if (chapterText.length >= 40) chapters.push(chapterText);
  }

  const text = chapters.join("\n\n").trim();
  if (text.length < 20) {
    throw new Error("This EPUB contains almost no extractable text (it may be image-based or DRM-protected).");
  }
  return text;
}

/** True when a ZIP archive looks like an EPUB (vs DOCX or other zips). */
export function zipLooksLikeEpub(data: ArrayBuffer): boolean {
  const head = new Uint8Array(data.slice(0, 64));
  const signature = "mimetypeapplication/epub+zip";
  const bytes = Array.from(head).map((b) => String.fromCharCode(b)).join("");
  return bytes.replace(/[\x00-\x1f]/g, "").startsWith(signature) || bytes.includes("application/epub+zip");
}
