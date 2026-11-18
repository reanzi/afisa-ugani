/**
 * Reads the NaPA "Idadi ya Anwani za Barabara" export (Ministry of
 * Communication and IT): one row per road or hamlet, with the ward (KATA) and
 * village/mtaa (MTAA/KIJIJI/SHEHIA) written only on the first row of each
 * group. Works on plain rows, so it does not depend on the spreadsheet library.
 */

export type NapaStreet = {
  name: string;
  /** ROAD, STREET, DRIVE, AVENUE, HAMLET… blank in some rural rows. */
  kind?: string;
  /** EARTH, GRAVEL, PAVED. */
  surface?: string;
  addresses?: number;
};
export type NapaVillage = { name: string; streets: NapaStreet[] };
export type NapaWard = { name: string; villages: NapaVillage[] };

export type NapaImport = {
  /** e.g. "Bagamoyo District Council", from the title row. */
  councilTitle: string | null;
  /** e.g. "01/07/2026", from "IMETOLEWA TAREHE …". */
  reportDate: string | null;
  wards: NapaWard[];
  totals: { wards: number; villages: number; streets: number; addresses: number };
  /** Rows that could not be placed (e.g. a road before any ward). */
  skipped: number;
};

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim());

/** "KWA MANOFU" → "Kwa Manofu", "BAGAMOYO RD." → "Bagamoyo Rd.". */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-z])/g, (_, pre: string, ch: string) => pre + ch.toUpperCase());
}

const HEADERS = {
  ward: ["KATA"],
  village: ["MTAA/KIJIJI/SHEHIA", "MTAA", "KIJIJI", "SHEHIA"],
  street: ["BARABARA/KITONGOJI", "BARABARA", "KITONGOJI"],
  kind: ["AINA"],
  surface: ["KIWANGO"],
  addresses: ["ANWANI", "IDADI YA ANWANI"],
};

function findColumns(row: string[]) {
  const up = row.map((c) => c.toUpperCase());
  const idx = (names: string[]) => up.findIndex((c) => names.includes(c));
  return {
    ward: idx(HEADERS.ward),
    village: idx(HEADERS.village),
    street: idx(HEADERS.street),
    kind: idx(HEADERS.kind),
    surface: idx(HEADERS.surface),
    addresses: idx(HEADERS.addresses),
  };
}

export class NapaFormatError extends Error {}

export function parseNapaRows(rows: readonly (readonly unknown[])[]): NapaImport {
  const cells = rows.map((r) => r.map(text));
  const headerAt = cells.findIndex((r) => {
    const c = findColumns(r);
    return c.ward >= 0 && c.village >= 0 && c.street >= 0;
  });
  if (headerAt < 0) {
    throw new NapaFormatError("Faili halina safu za KATA, MTAA/KIJIJI/SHEHIA na BARABARA/KITONGOJI. Tumia ripoti ya anwani kutoka mfumo wa NaPA.");
  }
  const col = findColumns(cells[headerAt]!);

  let councilTitle: string | null = null;
  let reportDate: string | null = null;
  for (const r of cells.slice(0, headerAt)) {
    const line = r.filter(Boolean).join(" ");
    const title = /ANWANI ZA BARABARA,\s*(.+)$/i.exec(line);
    if (title) councilTitle = titleCase(title[1]!.trim());
    const date = /TAREHE\s+([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i.exec(line);
    if (date) reportDate = date[1]!;
  }

  const wards: NapaWard[] = [];
  let ward: NapaWard | null = null;
  let village: NapaVillage | null = null;
  let skipped = 0;
  let addresses = 0;

  for (const r of cells.slice(headerAt + 1)) {
    const wName = r[col.ward] ?? "";
    const vName = r[col.village] ?? "";
    const sName = r[col.street] ?? "";
    if (!wName && !vName && !sName) continue;
    if (wName) {
      const name = titleCase(wName);
      ward = wards.find((w) => w.name === name) ?? null;
      if (!ward) {
        ward = { name, villages: [] };
        wards.push(ward);
      }
      village = null;
    }
    if (vName) {
      if (!ward) {
        skipped++;
        continue;
      }
      const name = titleCase(vName);
      village = ward.villages.find((v) => v.name === name) ?? null;
      if (!village) {
        village = { name, streets: [] };
        ward.villages.push(village);
      }
    }
    if (sName) {
      if (!village) {
        skipped++;
        continue;
      }
      const raw = col.addresses >= 0 ? Number(r[col.addresses]) : NaN;
      const count = Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : undefined;
      addresses += count ?? 0;
      village.streets.push({
        name: titleCase(sName),
        kind: col.kind >= 0 && r[col.kind] ? r[col.kind]!.toUpperCase() : undefined,
        surface: col.surface >= 0 && r[col.surface] ? r[col.surface]!.toUpperCase() : undefined,
        addresses: count,
      });
    }
  }

  const villages = wards.reduce((a, w) => a + w.villages.length, 0);
  const streets = wards.reduce((a, w) => a + w.villages.reduce((b, v) => b + v.streets.length, 0), 0);
  if (wards.length === 0) throw new NapaFormatError("Faili halina kata yoyote chini ya kichwa cha jedwali.");
  return { councilTitle, reportDate, wards, totals: { wards: wards.length, villages, streets, addresses }, skipped };
}
