/**
 * Weekly reports for the livestock and the crops sections: the ARDS tables
 * that fit a week, built from the officer's records of that week (Monday to
 * Sunday), plus the officer's short week-end notes. Official text, so always
 * built in Swahili.
 */
import { inSwahili } from "../lang.ts";
import { isReviewType } from "../actions.ts";
import { fertilizerTable, fertilizerUse } from "../fertilizer.ts";
import { financialYear, weekLabel, weekMonth, weekRange } from "../period.ts";
import type { Report, ReportPart } from "./model.ts";
import {
  partIntroduction,
  partLivestockHealth,
  partLivestockProducts,
  partMeatInspection,
  partPlantHealth,
  partSlaughter,
  WEEK,
  type IntroReview,
  type ReportRecord,
} from "./monthly.ts";

export const WEEKLY_SECTIONS = ["mifugo", "kilimo"] as const;
export type WeeklySection = (typeof WEEKLY_SECTIONS)[number];
export const isWeeklySection = (s: string): s is WeeklySection => (WEEKLY_SECTIONS as readonly string[]).includes(s);

/** Submission kind of a section's weekly report. */
export const weeklyKind = (section: WeeklySection) => (section === "mifugo" ? "weekly_mifugo" : "weekly_kilimo") as WeeklyKind;
export type WeeklyKind = "weekly_mifugo" | "weekly_kilimo";
export const weeklySectionOf = (kind: WeeklyKind): WeeklySection => (kind === "weekly_mifugo" ? "mifugo" : "kilimo");

/** The officer's week-end notes (record type "weekly_review"). */
export type WeeklyReview = IntroReview & { week: string; section: WeeklySection };

export type WeeklyInput = {
  week: string;
  section: WeeklySection;
  records: readonly ReportRecord[];
  review?: WeeklyReview | null;
  areaLabel: string;
  officerName: string;
  phone?: string | null;
};

const SECTION_NAME: Record<WeeklySection, string> = { mifugo: "Mifugo", kilimo: "Kilimo" };

function buildWeeklyReportSw(input: WeeklyInput): Report {
  const { week, section } = input;
  const { start, end } = weekRange(week);
  const inWeek = input.records.filter((r) => !r.deletedAt && !isReviewType(r.type) && r.occurredAt >= start && r.occurredAt < end);
  // Rain is one record for everyone; the other tables use the section's own records.
  const records = inWeek.filter((r) => r.section === section);
  const intro = partIntroduction(7, [...records, ...inWeek.filter((r) => r.type === "rainfall" && r.section !== section)], input.review ?? null);

  const parts: ReportPart[] =
    section === "mifugo"
      ? [intro, partSlaughter(records, WEEK), partMeatInspection(records), partLivestockProducts(7, records, WEEK), partLivestockHealth(records, WEEK)]
      : [
          intro,
          partPlantHealth(records),
          {
            id: "mbolea",
            number: "10",
            title: "Matumizi ya mbolea",
            blocks: [fertilizerTable("10", undefined, fertilizerUse(records))],
          },
        ];

  return {
    kind: "weekly",
    section,
    formVersion: "2018-07",
    month: week,
    header: {
      ministry: "OFISI YA RAIS - TAWALA ZA MIKOA NA SERIKALI ZA MITAA (OR-TAMISEMI)",
      title: `TAARIFA YA WIKI YA SEHEMU YA ${SECTION_NAME[section].toUpperCase()}`,
      edition: "Imejengwa kwa jedwali za fomu ya ARDS (Julai 2018)",
      areaLabel: input.areaLabel,
      officerName: input.officerName,
      phone: input.phone ?? "",
      monthLabel: weekLabel(week),
      periodName: "Wiki",
      financialYear: financialYear(weekMonth(week)),
      submitNote: `Iwasilishwe kwa Mkuu wa Sehemu ya ${SECTION_NAME[section]} kabla ya Jumatatu saa 11 alfajiri (05:00), kwa wiki iliyopita.`,
      instructions: [
        "Iwapo kitu kinachoulizwa hakipo kwenye kijiji/kata yako, andika “0” (sifuri).",
        "Iwapo kitu kinachoulizwa kipo kwenye kijiji/kata yako, andika makadirio kwa takwimu/idadi.",
        "Tumia vipimo vya kitaifa kwa kila jedwali vinapohitajika.",
      ],
    },
    parts,
  };
}

export const buildWeeklyReport = (input: WeeklyInput): Report => inSwahili(() => buildWeeklyReportSw(input));

/** Server-side check of a sent weekly report. */
export function validateWeeklyReport(p: unknown, week: string, section: WeeklySection): string | null {
  if (!p || typeof p !== "object") return "NOT_OBJECT";
  const r = p as Record<string, unknown>;
  if (r.kind !== "weekly" || r.month !== week || r.section !== section) return "BAD_KIND";
  if (!Array.isArray(r.parts) || r.parts.length === 0 || r.parts.length > 30) return "BAD_PARTS";
  if (!r.header || typeof r.header !== "object") return "BAD_HEADER";
  if (JSON.stringify(p).length > 600_000) return "TOO_LARGE";
  return null;
}
