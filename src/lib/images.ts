export type SupportedImageType = "jpg" | "png" | "webp";

export function detectImageType(data: Uint8Array): SupportedImageType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return "png";
  if (data.length >= 12 && Buffer.from(data.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(data.subarray(8, 12)).toString("ascii") === "WEBP") return "webp";
  return null;
}

export function imageExtension(type: SupportedImageType) {
  return type === "jpg" ? ".jpg" : `.${type}`;
}
