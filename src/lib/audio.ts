export type SupportedAudioType = "wav" | "mp3" | "m4a" | "ogg" | "flac";

function ascii(data: Uint8Array, start: number, end: number) {
  return Buffer.from(data.subarray(start, end)).toString("ascii");
}

export function detectAudioType(data: Uint8Array): SupportedAudioType | null {
  if (data.length >= 12 && ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 12) === "WAVE") return "wav";
  if (data.length >= 4 && ascii(data, 0, 3) === "ID3") return "mp3";
  if (data.length >= 2 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0) return "mp3";
  if (data.length >= 12 && ascii(data, 4, 8) === "ftyp") return "m4a";
  if (data.length >= 4 && ascii(data, 0, 4) === "OggS") return "ogg";
  if (data.length >= 4 && ascii(data, 0, 4) === "fLaC") return "flac";
  return null;
}

export function audioExtension(type: SupportedAudioType) {
  return `.${type}`;
}
