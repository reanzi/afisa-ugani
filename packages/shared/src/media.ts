/**
 * Photos. Each photo belongs to one record and inherits its time, place,
 * section and labels (crop, pest, severity…). The photo itself carries only
 * the kind of shot and an optional caption, so taking a picture stays a tap.
 *
 * On the phone photos are re-encoded to JPEG at most 1600 px on the long edge
 * (about 300 KB). Re-encoding also drops the camera's EXIF data (GPS, phone
 * model); the record's own location is kept separately.
 */
import { L } from "./lang.ts";
import { ANIMALS, ALL_CROPS, type Option } from "./catalogs.ts";

export const MEDIA_MAX_EDGE = 1600;
export const MEDIA_THUMB_EDGE = 320;
/** Server limit for one photo; the phone aims for ~300 KB. */
export const MEDIA_MAX_BYTES = 2_000_000;
/** Per record, to keep uploads and the dataset sensible. */
export const MEDIA_PER_RECORD = 6;
/** Full photos stay on the phone this long after upload; thumbnails stay. */
export const MEDIA_KEEP_ON_PHONE_DAYS = 30;

/** The shot, guiding a useful pair: the whole plant or animal, then a close-up of the problem. */
export const PHOTO_SHOTS = [
  { value: "nzima", get label() { return L("Mzima", "Whole"); }, get hint() { return L("Mmea, mnyama au shamba zima", "The whole plant, animal or field"); } },
  { value: "karibu", get label() { return L("Karibu", "Close-up"); }, get hint() { return L("Karibu kwenye tatizo: jani, mdudu, kidonda", "Close to the problem: leaf, pest, wound"); } },
  { value: "nyingine", get label() { return L("Nyingine", "Other"); }, get hint() { return L("Picha nyingine yoyote", "Any other photo"); } },
] as const;
export type PhotoShot = (typeof PHOTO_SHOTS)[number]["value"];
export const isPhotoShot = (v: unknown): v is PhotoShot => PHOTO_SHOTS.some((s) => s.value === v);

/** What an observation photo shows: the dataset's top-level label. */
export const PHOTO_CATEGORIES: Option[] = [
  { value: "wadudu", get label() { return L("Wadudu waharibifu", "Pests"); } },
  { value: "ugonjwa_mimea", get label() { return L("Ugonjwa wa mimea", "Plant disease"); } },
  { value: "upungufu", get label() { return L("Upungufu wa virutubisho", "Nutrient deficiency"); } },
  { value: "hali_ya_zao", get label() { return L("Hali ya zao (ukuaji, ukame, mafuriko)", "Crop condition (growth, drought, floods)"); } },
  { value: "magugu", get label() { return L("Magugu", "Weeds"); } },
  { value: "ugonjwa_mifugo", get label() { return L("Ugonjwa wa mifugo", "Livestock disease"); } },
  { value: "hali_ya_mifugo", get label() { return L("Hali ya mifugo na malisho", "Livestock and pasture condition"); } },
  { value: "samaki", get label() { return L("Samaki na mabwawa", "Fish and ponds"); } },
  { value: "mengine", get label() { return L("Mengine", "Other"); } },
];

export const CROP_CATEGORIES = ["wadudu", "ugonjwa_mimea", "upungufu", "hali_ya_zao", "magugu"];

export const GROWTH_STAGES: Option[] = [
  { value: "mche", get label() { return L("Mche (kuota)", "Seedling (emergence)"); } },
  { value: "ukuaji", get label() { return L("Ukuaji wa majani", "Leaf growth"); } },
  { value: "maua", get label() { return L("Maua", "Flowering"); } },
  { value: "kujaza", get label() { return L("Kujaza punje / matunda", "Grain / fruit filling"); } },
  { value: "kukomaa", get label() { return L("Kukomaa", "Maturity"); } },
  { value: "baada_ya_mavuno", get label() { return L("Baada ya mavuno (ghalani)", "After harvest (storage)"); } },
];

/** Typing suggestions for what the photo is of. */
export const PHOTO_SUBJECTS: readonly string[] = [...ALL_CROPS.filter((c) => c.value !== "nyingine").map((c) => c.label), ...ANIMALS.map((a) => a.label)];

export type MediaMeta = {
  clientId: string;
  recordClientId: string;
  width: number;
  height: number;
  bytes: number;
  shot: PhotoShot;
  caption?: string;
  takenAt: number;
};

/** Checks what the phone says about a photo; the server also reads the stored file's real size and type. */
export function validateMediaMeta(m: MediaMeta): string | null {
  if (!isPhotoShot(m.shot)) return "BAD_SHOT";
  for (const k of ["width", "height"] as const) {
    if (!Number.isInteger(m[k]) || m[k] < 16 || m[k] > MEDIA_MAX_EDGE) return `BAD_SIZE:${k}`;
  }
  if (!Number.isInteger(m.bytes) || m.bytes <= 0 || m.bytes > MEDIA_MAX_BYTES) return "TOO_LARGE";
  if (m.caption !== undefined && (typeof m.caption !== "string" || m.caption.length > 300)) return "BAD_CAPTION";
  if (!Number.isFinite(m.takenAt)) return "BAD_TIME";
  return null;
}

/** Fit inside a square of `max` px, never enlarging. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Photos must be taken in the field, now: a file older than this (by the
 * phone's own clock) came from the gallery, not the camera.
 */
export const PHOTO_MAX_AGE_MS = 10 * 60 * 1000;

/** True when a picked file is fresh from the camera. */
export function isFreshPhoto(lastModified: number, now = Date.now()): boolean {
  return Number.isFinite(lastModified) && lastModified > 0 && now - lastModified <= PHOTO_MAX_AGE_MS && lastModified <= now + 60_000;
}

/**
 * Labels for a photo, from the record it belongs to: what a viewer or a
 * dataset needs to know about the picture, with no names of people.
 */
export type PhotoLabels = {
  section: string;
  recordType: string;
  category?: string;
  subject?: string;
  observation?: string;
  suspected?: string;
  severity?: string;
  stage?: string;
};

export function photoLabels(record: { type: string; section: string; payload: Record<string, unknown> }): PhotoLabels {
  const p = record.payload;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const out: PhotoLabels = { section: record.section, recordType: record.type };
  if (record.type === "photo") {
    out.category = PHOTO_CATEGORIES.find((c) => c.value === p.category)?.label ?? str(p.category);
    out.subject = str(p.subject);
    out.observation = str(p.observation);
    out.suspected = str(p.suspected);
    out.severity = str(p.severity);
    out.stage = GROWTH_STAGES.find((g) => g.value === p.stage)?.label ?? str(p.stage);
  } else {
    // Other records: the crop or animal and the problem, where the form has them.
    out.subject = str(p.crop) ?? str(p.animal) ?? str(p.species) ?? str(p.commodity);
    out.suspected = str(p.pest) ?? str(p.disease);
    out.severity = str(p.severity);
  }
  return out;
}
