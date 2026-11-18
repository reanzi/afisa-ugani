/**
 * Reading a NaPA address report in the browser, and loading it into a council
 * one ward at a time. The spreadsheet library is loaded only when a file is chosen.
 */
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@afisa/backend/api";
import type { Id } from "@afisa/backend/dataModel";
import { NapaFormatError, parseNapaRows, type NapaImport } from "@afisa/shared";
import { errorMessage } from "@afisa/ui";
import { hqClient } from "./context";

const MAX_BYTES = 15 * 1024 * 1024;

export async function readNapaFile(file: File): Promise<NapaImport> {
  if (file.size > MAX_BYTES) throw new NapaFormatError("Faili ni kubwa mno (zaidi ya MB 15).");
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellFormula: false, cellHTML: false });
  const first = book.SheetNames[0];
  if (!first) throw new NapaFormatError("Faili halina karatasi yoyote.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[first]!, { header: 1, defval: "", blankrows: false, raw: true });
  return parseNapaRows(rows);
}

export function napaErrorText(e: unknown): string {
  if (e instanceof NapaFormatError) return e.message;
  if (e instanceof Error && /zip|cfb|unsupported|corrupt/i.test(e.message)) return "Faili hili halisomeki. Tumia .xls au .xlsx kutoka mfumo wa NaPA.";
  return errorMessage(e);
}

export type ImportProgress =
  | { state: "idle" }
  | { state: "running"; done: number; total: number; ward: string }
  | { state: "done"; added: { wards: number; villages: number; streets: number }; updated: number }
  | { state: "error"; message: string; done: number; total: number };

/** Loads each ward with its own call, so a big council never hits a size limit and progress is visible. */
export function useNapaImport() {
  const importWard = useMutation(api.areas.importNapaWard);
  const finish = useMutation(api.areas.finishNapaImport);
  const [progress, setProgress] = useState<ImportProgress>({ state: "idle" });

  const run = async (councilId: Id<"councils">, data: NapaImport) => {
    const total = data.wards.length;
    const added = { wards: 0, villages: 0, streets: 0 };
    let updated = 0;
    for (let i = 0; i < total; i++) {
      const ward = data.wards[i]!;
      setProgress({ state: "running", done: i, total, ward: ward.name });
      try {
        const res = await importWard({ councilId, ward, client: hqClient });
        added.wards += res.wardsAdded;
        added.villages += res.villagesAdded;
        added.streets += res.streetsAdded;
        updated += res.streetsUpdated;
      } catch (e) {
        setProgress({ state: "error", message: `Kata ya ${ward.name}: ${errorMessage(e)} Bonyeza "Pakia tena"; kata zilizokwisha ingia hazitarudiwa.`, done: i, total });
        return false;
      }
    }
    await finish({ councilId, reportDate: data.reportDate ?? undefined, totals: data.totals, client: hqClient });
    setProgress({ state: "done", added, updated });
    return true;
  };

  return { progress, run, reset: () => setProgress({ state: "idle" }) };
}
