/**
 * ARDS annual form ("Fomu ya Taarifa ya Mwaka", July 2018 edition), for a
 * financial year (July–June).
 *
 * From records: 5.1 farmer field schools (partly), 6.1 fertilizer use,
 * 6.2 pesticides. Everything else is typed in at the year's end; inventory
 * tables (households, machines, schemes, livestock, infrastructure,
 * communications) carry over from last year's report until confirmed.
 */
import { L, inSwahili } from "../lang.ts";
import { ALL_CROPS, FERTILIZER_KG, PESTICIDE_CLASSES, opts } from "../catalogs.ts";
import { fyKeyMonths, fyLabel, isFyKey, monthLabel, periodRange } from "../period.ts";
import { applyAdditions } from "./additions.ts";
import { inputTableBlock, sumOf, tableValues, validatePeriodReview, type InputCol, type InputPart, type InputTable, type RowValues, type TableRow } from "./forms.ts";
import type { Cell, Report, ReportPart, TableBlock } from "./model.ts";
import type { ReportRecord } from "./monthly.ts";
import { FORM_INSTRUCTIONS, MINISTRY, trainingSector, type PeriodReportInput } from "./quarterly.ts";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const rowsOf = (...labels: [string, string][]) => labels.map(([key, label]) => ({ key, label }));

export const ANNUAL_PARTS: readonly InputPart[] = [
  { id: "a1", number: "1", title: "Utangulizi, Taarifa za msingi za Kijiji/ Kata" },
  { id: "a2", number: "2", title: "Kilimo cha mkataba na makubaliano ya soko" },
  { id: "a3", number: "3", title: "Umwagiliaji" },
  { id: "a4", number: "4", title: "Mashine, zana na vifaa vya kilimo/ ufugaji na uvuvi" },
  { id: "a5", number: "5", title: "Huduma za ugani" },
  { id: "a6", number: "6", title: "Pembejeo" },
  { id: "a7", number: "7", title: "Idadi ya mifugo" },
  { id: "a8", number: "8", title: "Miundombinu katika mifugo" },
  { id: "a9", number: "9", title: "Eneo la malisho (Grazing land)" },
  { id: "a10", number: "10", title: "Malisho ya mifugo" },
  { id: "a11", number: "11", title: "Njia mbalimbali za mawasiliano (TV, radio, simu, nk.)" },
];

// ---------- shared column sets ----------

const count = (key: string, label: string, marker?: string): InputCol => ({ key, label, marker, kind: "count" });
const dec = (key: string, label: string, marker?: string): InputCol => ({ key, label, marker, kind: "decimal" });
const text = (key: string, label: string, marker?: string, width = 2): InputCol => ({ key, label, marker, kind: "text", width });

/** Working/broken × private/group, then the reason (4.1 and processing machines). */
const MACHINE_COLS: InputCol[] = [
  count("nzimaBinafsi", "Binafsi", "(ii)"),
  count("nzimaKikundi", "Kikundi", "(iii)"),
  count("mbovuBinafsi", "Binafsi", "(iv)"),
  count("mbovuKikundi", "Kikundi", "(v)"),
  text("sababu", "Sababu ya ubovu", "(vi)"),
];
const MACHINE_GROUPS = [
  { label: "Nzima", span: 2 },
  { label: "Mbovu", span: 2 },
  { label: "", span: 1 },
];
const IMPLEMENT_COLS: InputCol[] = [count("binafsi", "Binafsi"), count("kikundi", "Kikundi")];

const SEASONS = opts([
  ["1", "1 = Muda wote", "1 = All year"],
  ["2", "2 = Masika/ vuli", "2 = Rainy seasons"],
  ["3", "3 = Kiangazi", "3 = Dry season"],
]);
const SCHEME_STATES = opts([
  ["1", "1 = Nzuri", "1 = Good"],
  ["2", "2 = Inaridhisha", "2 = Satisfactory"],
  ["3", "3 = Inahitaji marekebisho", "3 = Needs repair"],
  ["4", "4 = Haijulikani", "4 = Unknown"],
]);
const SCHEME_KINDS = opts([
  ["iliyoendelezwa", "Skimu iliyoendelezwa", "Developed scheme"],
  ["asili", "Skimu ya asili", "Traditional scheme"],
]);
const SEED_CROPS = opts([
  ["mahindi", "Mahindi", "Maize"],
  ["mpunga", "Mpunga", "Rice"],
  ["maharage", "Maharage", "Beans"],
  ["mtama", "Mtama", "Sorghum"],
  ["ngano", "Ngano", "Wheat"],
  ["alizeti", "Alizeti", "Sunflower"],
  ["mengineyo", "Mengineyo", "Other"],
]);

const LIVESTOCK_COLS: InputCol[] = [
  count("asili", "Idadi wa asili"),
  count("nyama", "Nyama"),
  count("maziwa", "Maziwa"),
  { key: "jumla", label: "Jumla", kind: "count", compute: sumOf("asili", "nyama", "maziwa") },
  count("waliosajiliwa", "Jumla ya waliosajiliwa"),
];

const cattle: TableRow[] = [
  ...rowsOf(
    ["ngDume", "Ng’ombe dume*"],
    ["ngJike", "Ng’ombe jike**"],
    ["maksai", "Maksai***"],
    ["mtamba", "Mtamba****"],
    ["ndamaDume", "Ndama dume"],
    ["ndamaJike", "Ndama jike"],
    ["maksaiKulima", "Maksai wa kulima"],
    ["ngHaijulikani", "Haijulikani*****"],
  ),
  { key: "ngJumla", label: "Jumla ndogo ng’ombe", of: ["ngDume", "ngJike", "maksai", "mtamba", "ndamaDume", "ndamaJike", "maksaiKulima", "ngHaijulikani"] },
];

// ---------- typed-in tables ----------

export const ANNUAL_TABLES: readonly InputTable[] = [
  {
    id: "a1.1",
    part: "a1",
    carry: true,
    rowHeader: "",
    get hint() { return L("Idadi ya kaya kijijini/ katani na zinazoshiriki kila shughuli.", "Households in the village/ward and those in each activity."); },
    rows: rowsOf(["kaya", "Idadi ya kaya"]),
    cols: [
      count("wanaume", "Zinazoongozwa na wanaume"),
      count("wanawake", "Zinazoongozwa na wanawake"),
      { key: "jumla", label: "Jumla", kind: "count", compute: sumOf("wanaume", "wanawake") },
      count("mazao", "Zinazoshiriki kazi za kilimo mazao"),
      count("mifugo", "Zinazoshiriki ufugaji mifugo"),
      count("samaki", "Zinazoshiriki ufugaji samaki"),
    ],
  },
  {
    id: "a1.2",
    part: "a1",
    carry: true,
    rowHeader: "",
    rows: rowsOf(["watu", "Idadi ya watu"]),
    cols: [
      count("wanaume", "Wanaume"),
      count("wanawake", "Wanawake"),
      { key: "jumla", label: "Jumla", kind: "count", compute: sumOf("wanaume", "wanawake") },
      count("mazao", "Watu wanaoshiriki kazi za kilimo mazao"),
      count("mifugo", "Watu wanaoshiriki ufugaji mifugo"),
      count("samaki", "Watu wanaoshiriki ufugaji samaki"),
    ],
  },
  {
    id: "a2",
    part: "a2",
    carry: true,
    rowHeader: "Aina ya shughuli",
    note: "i) Mkataba wa soko ni makubaliano ya kisheria kati ya kaya/kikundi na kampuni katika kuzalisha mazao ya biashara. ii) Makubaliano ya soko hayahusishi mkataba. v), viii) Andika jina la zao kuu/bidhaa.",
    rows: rowsOf(["kilimo", "Kilimo"], ["ufugaji", "Ufugaji"], ["uvuvi", "Uvuvi"]),
    groups: [
      { label: "Mkataba wa soko (Contract farming) (i)", span: 3 },
      { label: "Makubaliano ya soko (Out-growers) (ii)", span: 3 },
    ],
    cols: [
      count("mkKaya", "Idadi ya kaya zinazoshiriki", "(iii)"),
      count("mkMakampuni", "Idadi ya makampuni yaliyohusika", "(iv)"),
      text("mkZao", "Zao kuu/ bidhaa", "(v)", 1),
      count("msKaya", "Idadi ya kaya zinazoshiriki", "(vi)"),
      count("msMakampuni", "Idadi ya makampuni yaliyohusika", "(vii)"),
      text("msZao", "Zao kuu/ bidhaa", "(viii)", 1),
    ],
  },
  {
    id: "a3.1",
    part: "a3",
    title: "3.1 Skimu ya umwagiliaji",
    carry: true,
    extraRows: 30,
    get hint() { return L("Skimu moja kwa kila mstari. Hubaki mwaka hadi mwaka; badilisha kilichobadilika tu.", "One scheme per row. Kept year to year; change only what changed."); },
    note: '(iii) "Eneo linalofaa kwa umwagiliaji" ni eneo linalolimwa au lisilolimwa lakini linafaa kwa umwagiliaji katika skimu husika. (iv) "Eneo lililomwagiliwa" ni eneo lililoendelezwa kwa ajili ya umwagiliaji katika skimu iliyotajwa.',
    groups: [
      { label: "", span: 6 },
      { label: "Idadi ya wamwagiliaji (wanachama na wasio wanachama)", span: 2 },
      { label: "Idadi ya wanachama katika chama cha wamwagiliaji (IO)", span: 2 },
      { label: "", span: 1 },
    ],
    cols: [
      text("jina", "Jina la skimu", "(i)"),
      text("chanzo", "Chanzo cha maji (mfano; mto Rufiji)", "(ii)"),
      dec("eneoLinalofaa", "Eneo linalofaa kwa umwagiliaji (ha)", "(iii)"),
      dec("eneoLililomwagiliwa", "Eneo lililomwagiliwa (ha)", "(iv)"),
      { key: "msimu", label: "Msimu wa umwagiliaji", kind: "choice", options: SEASONS },
      { key: "hali", label: "Hali ya skimu", kind: "choice", options: SCHEME_STATES },
      count("wamwagiliajiWanaume", "Wanaume"),
      count("wamwagiliajiWanawake", "Wanawake"),
      count("ioWanaume", "Wanaume"),
      count("ioWanawake", "Wanawake"),
      { key: "aina", label: "Aina ya skimu", kind: "choice", options: SCHEME_KINDS },
    ],
  },
  {
    id: "a4.1",
    part: "a4",
    title: "4.1 Idadi ya mashine/ vifaa vya kilimo, ufugaji na uvuvi",
    carry: true,
    rowHeader: "Aina ya mashine/ vifaa (i)",
    extraRows: 10,
    extraLabel: "Mengineyo (Taja)",
    note: "Mashine, zana au vifaa vilivyoazimwa kutoka vijiji jirani havihusiki. (ii)~(v) Za serikali au taasisi (kampuni binafsi) zihesabiwe kwenye vikundi.",
    groups: MACHINE_GROUPS,
    cols: MACHINE_COLS,
    rows: rowsOf(
      ["trekta", "Trekta (Tractor)"],
      ["powerTiller", "Trekta la mkono (Power tiller)"],
      ["combine", "Mashine ya kuvunia (Combine harvester)"],
      ["mower", "Mashine ya kufyeka nyasi (Mower)"],
      ["bailer", "Mashine ya kutengenezea nyasi (Bailer)"],
      ["feeder", "Vifaa vya chakula (Feeder)"],
      ["drinker", "Vifaa vya maji (Drinker)"],
      ["milking", "Mashine ya kukamulia maziwa (Milking machine)"],
      ["chillers", "Mashine ya kupoozea (Chillers)"],
      ["meatCutter", "Mashine ya umeme ya kukatia nyama (Electric meat cutter)"],
      ["patrolBoat", "Mitumbwi ya ulinzi yenye injini (Patrol boat)"],
      ["boatEngine", "Mitumbwi ya uvuvi yenye injini (Fishing boat with engine)"],
      ["boat", "Mitumbwi ya uvuvi (Fishing boat without engine)"],
    ),
  },
  {
    id: "a4.2a",
    part: "a4",
    title: "4.2 Idadi ya zana za kilimo: zana zinazokokotwa na trekta/ trekta la mkono (nzima)",
    carry: true,
    rowHeader: "Aina ya zana",
    extraRows: 10,
    extraLabel: "Mengineyo (Taja)",
    cols: IMPLEMENT_COLS,
    rows: rowsOf(
      ["harrow", "Jembe la kusawazisha (Harrow)"],
      ["planter", "Mashine ya kupanda (Planter)"],
      ["disk", "Jembe la kulima (Disk plough)"],
      ["subsoiler", "Jembe la kutifua (Sub-soiler)"],
      ["weeder", "Jembe la kupalilia (Weeder)"],
      ["boom", "Mashine ya kupuliza dawa za mimea (Boom sprayer)"],
      ["ripper", "Jembe la kukatua (Ripper)"],
      ["rake", "Reki ya kukusanyia nyasi (Rake for Hay Making)"],
      ["trailer", "Tela (Trailer)"],
    ),
  },
  {
    id: "a4.2b",
    part: "a4",
    title: "Zana zinazokokotwa na wanyamakazi (nzima)",
    carry: true,
    rowHeader: "Aina ya zana",
    extraRows: 10,
    extraLabel: "Mengineyo (taja)",
    cols: IMPLEMENT_COLS,
    rows: rowsOf(
      ["harrow", "Jembe la kusawazisha (Harrow)"],
      ["planter", "Mashine ya kupanda (Planter)"],
      ["moldboard", "Jembe la kulima (Moldboard plough)"],
      ["subsoiler", "Jembe la kutifua (Sub-soiler)"],
      ["weeder", "Jembe la kupalilia (Weeder)"],
      ["ripper", "Jembe la kukatua (Ripper)"],
      ["ridger", "Jembe la matuta (Ridger)"],
      ["cart", "Mkokoteni (Cart)"],
    ),
  },
  {
    id: "a4.2c",
    part: "a4",
    title: "Idadi ya vifaa vinavyotumiwa kwa mkono",
    carry: true,
    rowHeader: "",
    note: "* Kwa ajili ya utambuzi wa mifugo.",
    rows: rowsOf(["idadi", "Idadi"]),
    cols: [
      count("majembe", "Majembe ya mkono"),
      count("pampu", "Pampu ya kupuliza dawa (mimea/mifugo)"),
      count("visu", "Visu vya kuchunia"),
      count("nyavu", "Nyavu za kuvulia"),
      count("vyuma", "Vyuma vya kuwekea alama*"),
      count("nyingineIdadi", "Nyingine (idadi)"),
      text("nyingine", "Nyingine (taja)", undefined, 2),
    ],
  },
  {
    id: "a4.3",
    part: "a4",
    title: "Mashine za kusindika mazao ya Kilimo/ Mifugo/ Uvuvi",
    carry: true,
    rowHeader: "Aina ya mashine (i)",
    extraRows: 10,
    extraLabel: "Mengineyo (Taja)",
    note: "Hesabu idadi ya mashine zilizopo kijijini/ kwenye kata. (ii)~(v) Za serikali na taasisi (kampuni binafsi) ziwekwe katika umiliki wa vikundi.",
    groups: MACHINE_GROUPS,
    cols: MACHINE_COLS,
    rows: rowsOf(
      ["unga", "Kusaga unga"],
      ["kupukuchua", "Kupukuchua"],
      ["mafuta", "Kukamulia mafuta"],
      ["mbeguMafuta", "Kupasua mbegu za mafuta"],
      ["pulperies", "Kubangulia (Pulperies)"],
      ["pamba", "Kusindika pamba"],
      ["shelling", "Kuondoa maganda (Shelling)"],
      ["hei", "Kutengenezea hei"],
      ["maziwa", "Kusindika mazao yatokanayo na maziwa"],
      ["vifaranga", "Kutotoleshea vifaranga"],
      ["nyama", "Kusindika nyama"],
      ["ngozi", "Kusindika ngozi"],
      ["gariNyama", "Gari la kubebea nyama"],
      ["gariMaziwa", "Gari la kubebea maziwa"],
      ["barafu", "Kutengenezea barafu"],
      ["samaki", "Kusindika mazao yatokanayo na samaki"],
    ),
  },
  {
    id: "a5.1",
    part: "a5",
    title: "5.1 Mafunzo ya wakulima kupitia shamba darasa",
    rowHeader: "",
    note: "i) Orodhesha malengo ya mashamba darasa kwa kila sekta. ii) Idadi ya mashamba darasa yaliyotumika kutimiza lengo husika. iii) Idadi ya wakulima walioanza shamba darasa.",
    get hint() { return L("Idadi ya shamba darasa, walioanza, muda na vijiji vinajazwa kutoka kumbukumbu za mafunzo. Andika lengo, waliohitimu na wanaotumia elimu.", "Number of field schools, starters, length and villages come from your training records. Type the goal, graduates and adopters."); },
    rows: rowsOf(["mazao", "Mazao"], ["ufugaji", "Ufugaji"], ["uvuvi", "Uvuvi"], ["masoko", "Masoko na Usindikaji"], ["mengineyo", "Mengineyo"]),
    groups: [
      { label: "", span: 2 },
      { label: "Idadi ya walioanza (iii)", span: 2 },
      { label: "", span: 1 },
      { label: "Idadi ya waliohitimu", span: 2 },
      { label: "", span: 3 },
    ],
    cols: [
      text("lengo", "Lengo la shamba darasa", "(i)"),
      { key: "idadi", label: "Idadi ya shamba darasa", marker: "(ii)", kind: "count", auto: true },
      { key: "walioanzaWanaume", label: "Wanaume", kind: "count", auto: true },
      { key: "walioanzaWanawake", label: "Wanawake", kind: "count", auto: true },
      { key: "siku", label: "Muda wa mafunzo (siku)", kind: "count", auto: true },
      count("waliohitimuWanaume", "Wanaume"),
      count("waliohitimuWanawake", "Wanawake"),
      { key: "vijiji", label: "Idadi ya vijiji vilivyohudumiwa", kind: "count", auto: true },
      count("wanaotumia", "Idadi ya wakulima wanaotumia elimu ya mafunzo yaliyotolewa"),
      text("maelezo", "Maelezo", undefined, 1),
    ],
  },
  {
    id: "a6.1",
    part: "a6",
    title: "6.1 Mbolea za viwandani",
    rowHeader: "Aina ya mbolea",
    extraRows: 10,
    extraLabel: "Mengineyo (Taja)",
    note: "Pia kiasi cha mbolea inayotumika katika kuzalisha malisho ya mifugo ijumuishwe. Matumizi yanajumlishwa kutoka kumbukumbu za mbolea za mwaka (kg zimegeuzwa kuwa tani).",
    get hint() { return L("Matumizi yanajazwa kutoka kumbukumbu za mbolea. Andika mahitaji ya mwaka.", "Use comes from your fertilizer records. Type the year's need."); },
    cols: [
      dec("mahitaji", "Mahitaji kwa mwaka (tani)"),
      { key: "matumizi", label: "Matumizi kwa mwaka (tani)", kind: "decimal", auto: true },
      text("maelezo", "Maelezo"),
    ],
    rows: rowsOf(
      ["sa", "SA"],
      ["can", "CAN"],
      ["urea", "UREA"],
      ["tsp", "TSP"],
      ["dap", "DAP"],
      ["10_10_10", "NPK 10:10:10"],
      ["25_5_5", "NPK 25:5:5"],
      ["6_20_18", "NPK 6:20:18 / 10:18:24"],
      ["4_17_15", "NPK 4:17:15"],
      ["17_17_17", "NPK 17:17:17"],
      ["minjingu", "MRP (Minjingu Rock Phosphate)"],
      ["mop", "MOP"],
    ),
  },
  {
    id: "a6.3",
    part: "a6",
    title: "6.3 Mbegu bora",
    extraRows: 40,
    get hint() { return L("Mstari mmoja kwa kila aina ya mbegu bora ya zao.", "One row per improved variety of a crop."); },
    groups: [
      { label: "", span: 3 },
      { label: "Matumizi kwa mwaka (kg)", span: 2 },
      { label: "", span: 1 },
    ],
    cols: [
      { key: "zao", label: "Aina ya zao", kind: "choice", options: SEED_CROPS },
      dec("mahitaji", "Mahitaji kwa mwaka (kg)"),
      text("aina", "Aina ya mbegu bora (Orodhesha)"),
      dec("qds", "Mbegu zenye ubora unaotambulika (Quality Declared Seed)"),
      dec("certified", "Mbegu zenye ubora uliothibitishwa (Certified seed)"),
      text("maelezo", "Maelezo", undefined, 1),
    ],
  },
  {
    id: "a7.1",
    part: "a7",
    carry: true,
    rowHeader: "Aina ya mnyama",
    note: "* Ng’ombe dume ni ambaye hajahasiwa anatumiwa kwa kuzalisha mbegu. ** Ng’ombe jike ni ambaye amewahi kuzaa angalau mara moja. *** Maksai ni ng’ombe dume aliyehasiwa mwenye umri zaidi ya mwaka mmoja. **** Mtamba ni ng’ombe jike mwenye umri wa miaka kati ya mmoja na mitatu ambaye hajazaa. ***** Kama ni vigumu kufahamu mchanganuo, andika idadi ya jumla kwenye “Haijulikani”. Hesabu wanyama wote kasoro wa wakulima wakubwa (large scale farmers).",
    // Spans count the value columns only; the row-label column is added by inputTableBlock.
    groups: [
      { label: "", span: 1 },
      { label: "Idadi wa kisasa", span: 2 },
      { label: "", span: 2 },
    ],
    cols: LIVESTOCK_COLS,
    rows: [
      ...cattle,
      ...rowsOf(["kondooDume", "Kondoo dume"], ["kondooJike", "Kondoo jike"], ["kondooHaijulikani", "Kondoo: haijulikani*****"]),
      { key: "kondooJumla", label: "Jumla ndogo kondoo", of: ["kondooDume", "kondooJike", "kondooHaijulikani"] },
      ...rowsOf(["mbuziDume", "Mbuzi dume"], ["mbuziJike", "Mbuzi jike"], ["mbuziHaijulikani", "Mbuzi: haijulikani*****"]),
      { key: "mbuziJumla", label: "Jumla ndogo mbuzi", of: ["mbuziDume", "mbuziJike", "mbuziHaijulikani"] },
      ...rowsOf(
        ["nguruwe", "Nguruwe"],
        ["nyatiMaji", "Nyati maji"],
        ["punda", "Punda"],
        ["farasi", "Farasi"],
        ["ngamia", "Ngamia"],
        ["mbwa", "Mbwa"],
        ["paka", "Paka"],
        ["sungura", "Sungura"],
      ),
    ],
  },
  {
    id: "a7.2",
    part: "a7",
    title: "Ndege",
    carry: true,
    rowHeader: "Ndege",
    cols: [
      count("asili", "Idadi ya wa asili"),
      count("nyama", "Wa nyama"),
      count("mayai", "Wa mayai"),
      { key: "jumla", label: "Jumla", kind: "count", compute: sumOf("asili", "nyama", "mayai") },
    ],
    rows: rowsOf(["kuku", "Kuku"], ["bata", "Bata"], ["bataMzinga", "Bata mzinga"], ["kanga", "Kanga"]),
  },
  {
    id: "a8",
    part: "a8",
    carry: true,
    rowHeader: "Aina ya miundombinu",
    extraRows: 10,
    extraLabel: "Mengineyo (Taja)",
    note: "* Karo ni mahali pa kuchinjia wanyama, kwenye sakafu katika eneo la wazi.",
    cols: [count("nzima", "Nzima"), count("mbovu", "Mbovu"), count("mahitaji", "Mahitaji halisi"), count("zilizosajiliwa", "Idadi ya zilizosajiliwa"), text("sababu", "Sababu ya ubovu wa miundombinu")],
    rows: rowsOf(
      ["karo", "Karo (Slaughter Slab)*"],
      ["buchaNgombe", "Bucha ya ng'ombe/mbuzi/kondoo"],
      ["buchaNguruwe", "Bucha ya nguruwe"],
      ["buchaSamaki", "Bucha ya samaki"],
      ["bandaNgozi", "Banda la ngozi"],
      ["banio", "Banio la kudumu (Permanent crush)"],
      ["lambo", "Lambo"],
      ["birika", "Birika la kunywea maji (Water Trough)"],
      ["joshoWakubwa", "Josho la wanyama wakubwa (Ng’ombe, Punda)"],
      ["joshoWadogo", "Josho la wanyama wadogo (Mbuzi, Kondoo, Mbwa)"],
      ["sprayRace", "Sehemu ya kunyunyuzia dawa mifugo (Spray Race)"],
    ),
  },
  {
    id: "a9",
    part: "a9",
    carry: true,
    rowHeader: "Aina ya mfugo (i)",
    note: "(iii) Eneo linalofaa, linalotumika na lisilotumika. (iv) Eneo halisi linalotumika kulishia wanyama. (vi) Eneo lililopewa hati.",
    rows: rowsOf(["wote", "Ng'ombe, Mbuzi, Kondoo, Punda"]),
    cols: [
      dec("ukubwa", "Ukubwa wa eneo la kulishia wanyama kijijini/ kata (ha)", "(iii)"),
      dec("linalotumika", "Eneo linalotumika (ha)", "(iv)"),
      dec("lililopimwa", "Ukubwa wa eneo lililopimwa kwa ajili ya malisho (Total Demarcated Area) (ha)", "(v)"),
      dec("kisheria", "Ukubwa wa eneo linalomilikiwa kisheria (Total Area Leased) (ha)", "(vi)"),
    ],
  },
  {
    id: "a10.1",
    part: "a10",
    title: "10.1 Malisho ya mifugo yaliyopandwa na kuendelezwa",
    rowHeader: "",
    note: "* Robota moja la hei lina uzito wa kilo 20.",
    rows: rowsOf(["malisho", "Malisho yaliyopandwa"]),
    cols: [count("mashamba", "Idadi ya mashamba"), dec("eneo", "Eneo (ha)"), dec("mbegu", "Uzalishaji wa mbegu (kg)"), count("marobota", "Idadi ya marobota/ bandali (bundle) yaliyozalishwa (Hei*)"), text("maelezo", "Maelezo")],
  },
  {
    id: "a10.2",
    part: "a10",
    title: "10.2 Masalia ya mazao",
    extraRows: 20,
    note: "* Robota moja lina uzito wa kilo 20.",
    cols: [
      { key: "zao", label: "Aina ya zao", kind: "choice", options: ALL_CROPS },
      count("marobota", "Idadi ya marobota*/ bandali (bundle) yaliyozalishwa"),
      dec("eneo", "Eneo la mashamba yaliyotumika kwa malisho (grazed in situ) (ha)"),
      text("maelezo", "Maelezo"),
    ],
  },
  {
    id: "a11.1",
    part: "a11",
    title: "11.1 TV",
    carry: true,
    rowHeader: "Kituo cha TV kinachopatikana",
    extraRows: 10,
    extraLabel: "Vituo vya TV vya kijamii, taja",
    cols: [count("vijiji", "Idadi ya vijiji vinavyofikiwa na huduma")],
    rows: rowsOf(["tbc", "TBC"], ["itv", "ITV"], ["star", "Star TV"]),
  },
  {
    id: "a11.2",
    part: "a11",
    title: "Radio",
    carry: true,
    rowHeader: "Kituo cha Radio kinachopatikana",
    extraRows: 10,
    extraLabel: "Vituo vya Radio vya kijamii, taja",
    cols: [count("vijiji", "Idadi ya vijiji vinavyofikiwa na huduma")],
    rows: rowsOf(["radio1", "Radio 1"], ["tbcTaifa", "TBC Taifa"], ["rfa", "Radio Free Africa"]),
  },
  {
    id: "a11.3",
    part: "a11",
    title: "Kama kituo cha TV/ Radio cha kijamii kipo na kinarusha kipindi cha kilimo na ufugaji hewani, jaza jedwali hili.",
    carry: true,
    extraRows: 10,
    cols: [text("chombo", "Jina la chombo cha habari"), text("kipindi", "Jina la kipindi"), count("mara", "Mara ngapi kwa wiki"), text("aina", "Aina ya taarifa")],
  },
  {
    id: "a11.4",
    part: "a11",
    title: "Simu",
    carry: true,
    rowHeader: "Jina la kampuni ya simu",
    extraRows: 5,
    extraLabel: "Mengineyo, taja",
    cols: [count("vijiji", "Idadi ya vijiji vinavyofikiwa na huduma")],
    rows: rowsOf(["sasatel", "Sasatel"], ["tigo", "Tigo"], ["ttcl", "TTCL"], ["vodacom", "Vodacom"], ["airtel", "Airtel"], ["zantel", "Zantel"]),
  },
];

export const validateAnnualReview = (p: Record<string, unknown>) => validatePeriodReview(ANNUAL_TABLES, isFyKey, p);

// ---------- record-built values ----------

/** A farmer field school: the record's group name, else its topic in its area. */
const ffsKey = (r: ReportRecord) => (str(r.payload.group) || `${str(r.payload.topic)}@${r.areaId ?? ""}`).toLowerCase();

/** 5.1 auto columns, by sector row. Starters are the largest session of each school, so repeat sessions are not counted twice. */
export function ffsAuto(records: readonly ReportRecord[]): Record<string, RowValues> {
  const rs = records.filter((r) => r.type === "training" && r.payload.method === "shamba_darasa");
  const out: Record<string, RowValues> = {};
  for (const sector of ["mazao", "ufugaji", "uvuvi", "masoko", "mengineyo"]) {
    const mine = rs.filter((r) => {
      const s = trainingSector(r);
      return sector === "mengineyo" ? s === "umwagiliaji" : s === sector;
    });
    const schools = new Map<string, ReportRecord[]>();
    for (const r of mine) schools.set(ffsKey(r), [...(schools.get(ffsKey(r)) ?? []), r]);
    let men = 0;
    let women = 0;
    let days = 0;
    for (const g of schools.values()) {
      men += Math.max(...g.map((r) => num(r.payload.men)));
      women += Math.max(...g.map((r) => num(r.payload.women)));
      days += g.reduce((a, r) => a + (num(r.payload.days) || 1), 0);
    }
    out[sector] = {
      idadi: schools.size,
      walioanzaWanaume: men,
      walioanzaWanawake: women,
      siku: schools.size ? Math.round(days / schools.size) : 0,
      vijiji: new Set(mine.map((r) => r.areaId).filter(Boolean)).size,
    };
  }
  return out;
}

/** 6.1 use in tonnes, by form row; NPK without a grade goes to its own row. */
export function fertilizerTonnes(records: readonly ReportRecord[]): Record<string, RowValues> {
  const kg = new Map<string, number>();
  for (const r of records) {
    if (r.type !== "fertilizer") continue;
    const f = str(r.payload.fertilizer);
    const unit = str(r.payload.unit) || "kg";
    if (unit === "lita" || f === "samadi" || f === "mboji" || f === "majani" || f === "nyingine") continue;
    const row = f === "npk" ? str(r.payload.npkGrade) || "npkBila" : f;
    kg.set(row, (kg.get(row) ?? 0) + num(r.payload.quantity) * (FERTILIZER_KG[unit] ?? 1));
  }
  const out: Record<string, RowValues> = {};
  for (const [row, v] of kg) {
    out[row === "nyingine" ? "npkNyingine" : row] = {
      matumizi: round(v / 1000, 3),
      ...(row === "npkBila" ? { _label: "NPK (daraja halikuandikwa)" } : row === "nyingine" ? { _label: "NPK nyingine" } : {}),
    };
  }
  return out;
}

/** 6.2 Pesticides by class, from chemical control on pest records. */
export function pesticideTable(records: readonly ReportRecord[]): TableBlock {
  const rs = records.filter((r) => r.type === "pest_outbreak" && r.payload.method === "kemikali" && (str(r.payload.pesticide) || num(r.payload.quantity)));
  const LETTERS = ["A", "B", "C", "D", "E", "F"];
  const classes = [...PESTICIDE_CLASSES.map((c, i) => ({ value: c.value, label: `${LETTERS[i]}: ${(c.sw ?? c.label).split(" (")[0]}` })), { value: "", label: "Kundi halikuandikwa" }];
  const rows: Cell[][] = [];
  for (const c of classes) {
    const mine = rs.filter((r) => (str(r.payload.pesticideClass) || "") === c.value);
    const products = new Map<string, { name: string; unit: string; qty: number }>();
    for (const r of mine) {
      const name = str(r.payload.pesticide) || "Haijatajwa";
      const unit = str(r.payload.unit) || "lita";
      const k = `${name.toLowerCase()}|${unit}`;
      const p = products.get(k) ?? { name, unit, qty: 0 };
      p.qty += num(r.payload.quantity);
      products.set(k, p);
    }
    if (products.size === 0) {
      if (c.value) rows.push([c.label, "", "", 0, ""]);
      continue;
    }
    for (const p of products.values()) rows.push([c.label, p.name, p.unit === "kg" ? "kg" : "lita", round(p.qty), ""]);
  }
  const unclassed = rs.filter((r) => !str(r.payload.pesticideClass)).length;
  return {
    kind: "table",
    id: "a6.2",
    title: "6.2 Viatilifu",
    columns: [
      { label: "Aina ya kiatilifu/ kiuadudu", width: 2 },
      { label: "Jina la kiatilifu/ kiuadudu *", width: 2 },
      { label: "Kipimo (kg/ lita)" },
      { label: "Matumizi kwa mwaka", align: "end" },
      { label: "Maelezo", width: 2 },
    ],
    rows,
    note: ["* Andika jina la bidhaa. Matumizi yanajumlishwa kutoka kumbukumbu za udhibiti kwa kemikali.", unclassed ? `Kumbukumbu ${unclassed} hazina kundi la kiatilifu.` : ""].filter(Boolean).join(" "),
    hasData: rs.length > 0,
  };
}

// ---------- the form ----------

function buildAnnualReportSw(input: PeriodReportInput): Report {
  const { period, review, previous } = input;
  const months = fyKeyMonths(period);
  const { start, end } = periodRange(months);
  const records = input.records.filter((r) => !r.deletedAt && r.occurredAt >= start && r.occurredAt < end && !r.type.endsWith("_review"));
  const auto: Record<string, Record<string, RowValues>> = { "a5.1": ffsAuto(records), "a6.1": fertilizerTonnes(records) };
  const typed = (id: string) => {
    const spec = ANNUAL_TABLES.find((s) => s.id === id)!;
    return inputTableBlock(spec, tableValues(spec, review, previous), auto[id]);
  };
  const blocks = (partId: string): TableBlock[] => {
    const tables = ANNUAL_TABLES.filter((t) => t.part === partId).map((t) => typed(t.id));
    if (partId === "a6") tables.splice(1, 0, pesticideTable(records));
    return tables;
  };
  const report: Report = {
    kind: "annual",
    formVersion: "2018-07",
    month: period,
    header: {
      ministry: MINISTRY,
      title: "FOMU YA TAARIFA YA MWAKA YA MPANGO WA MAENDELEO YA KILIMO WA KIJIJI/KATA",
      edition: "Toleo la Julai 2018",
      areaLabel: input.areaLabel,
      officerName: input.officerName,
      phone: input.phone ?? "",
      monthLabel: monthLabel(months[11]!, "sw"),
      periodName: "Mwezi",
      financialYear: fyLabel(period),
      submitNote:
        "Iwasilishwe kwenye kata kabla ya mwisho wa mwaka kutoka kwenye kijiji, na wilayani mwisho wa wiki ya kwanza ya mwaka unaofuata kutoka kwenye kata.",
      instructions: FORM_INSTRUCTIONS,
    },
    parts: ANNUAL_PARTS.map((p): ReportPart => ({ id: p.id, number: p.number, title: p.title, blocks: blocks(p.id) })),
  };
  return applyAdditions(report, review?.additions);
}

export const buildAnnualReport = (input: PeriodReportInput): Report => inSwahili(() => buildAnnualReportSw(input));
