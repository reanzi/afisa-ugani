# ARDS quarterly and annual forms: field mapping and plan

Source: *New VAEO/WAEO Form, July 2018* (OR-TAMISEMI), the same edition as the monthly form the app already builds.

How each table gets its data:
- **Auto:** filled from the officer's records for the period, with no typing.
- **Partly auto:** some columns come from records, the rest are typed in.
- **Input:** typed in at the end of the period, because nothing in the daily records holds it.
- **Carry-over:** inventory data (machines, schemes, livestock counts…). It is typed in once, then pre-filled from the last sent report each year, so the officer only updates what changed.

---

## Quarterly form (Fomu ya Taarifa ya Robo Mwaka)

Header: Robo (months *from–to*), financial year, submission date. Due: village → ward before the quarter ends; ward → district by the end of the first week of the next month.

| # | Table | Source | How |
|---|---|---|---|
| 1 | Food situation: Nzuri / Wastani / Mbaya + notes | Input | One choice + note. The quarter's price records, which include availability (wingi/haba/haipatikani), are shown beside it as a hint. |
| 1 | Households: no food / short / enough / surplus | Input | Four counts. |
| 2.1 | SACCOs | Input | The docx has only the title; the columns are provisional (see below). |
| 2.2 | Other farmer groups | Input | Same: title only in the docx. |
| 3.1 | Training outside farmer field schools: topic per sector (Mazao, Ufugaji, Umwagiliaji, Masoko na Usindikaji, Uvuvi), farmers trained M/F, by length (≤ 1 week / > 1 week), method, trainer, notes | Partly auto | From `training` records whose method is not *shamba darasa*: topics, method and men/women are summed per sector. Length and trainer come from the new optional *Muda (siku)* and *Mtoa mafunzo* fields; older records show as "length not recorded". |
| 4.1 | Biological / natural pest control: pest, crop, methods, area controlled (ha), households, notes | Auto | From `pest_outbreak` records with method *kibaiolojia*: pest, crop, households and area saved. "Methods used" comes from the record's medicine/method text. |
| 5.1 | Irrigated crops: area (ha), yield (t/ha), harvest (t) for Masika/Vuli and Kiangazi | Input | Records and month-end crop estimates don't separate irrigated land. Harvest = area × yield is calculated, as in the monthly form. |
| 6 | Soil erosion: type (English), villages, area damaged, methods, area restored, notes | Input | Rows the officer adds. |
| 7.1–7.2 | Area by tillage method (tractor, oxen, hand hoe, no-till) for Vuli and Masika: tilled / planted / weeded / harvested | Input | The monthly crop estimates give planted and harvested **totals**, shown as a check ("your monthly estimates say 412 ha planted"). The breakdown by method is typed in. |

## Annual form (Fomu ya Taarifa ya Mwaka)

Header: month, financial year, submission date. Due: village → ward before the year ends (financial year: end of June); ward → district by the end of the first week of the next year.

| # | Table | Source | How |
|---|---|---|---|
| 1 | Households (male/female-headed, total, in crops / livestock / fish) and people (men, women, total, in each) | Input + carry-over | |
| 2 | Contract farming and out-growers: households, companies and main crop, for Kilimo / Ufugaji / Uvuvi | Input | |
| 3.1 | Irrigation schemes: name, water source, suitable area, irrigated area, season, condition, irrigators M/F, IO members M/F, developed or traditional | Input + carry-over | A list of schemes, updated yearly. |
| 4.1 | Machines (tractor … boats): working/broken × private/group, reason broken | Input + carry-over | |
| 4.2 | Tractor-drawn and animal-drawn implements; hand tools; processing machines | Input + carry-over | |
| 5.1 | Farmer field schools (shamba darasa) by sector: goal, number of FFS, starters M/F, length (days), graduates M/F, villages served, farmers applying the knowledge | Partly auto | From `training` records with method *shamba darasa*: number of FFS (distinct *Kikundi*), starters M/F (largest session per group, so repeat sessions aren't double-counted) and villages. Goal, length, graduates and adopters are typed in. |
| 6.1 | Fertilizer per type: need (t) and use (t) for the year | Partly auto | Use is summed from `fertilizer` records and converted to tonnes. NPK is split by the new **NPK grade** field on the fertilizer record (old records without a grade go to "NPK nyingine"). MOP was added to the fertilizer list. Need is typed in. |
| 6.2 | Pesticides by class (insecticide, fungicide, rodenticide, avicide, nematicide…): product, unit, yearly use | Partly auto | From `pest_outbreak` records with method *kemikali*: product name, quantity and unit. The class comes from the new **pesticide class** field on the record. Note: the official docx repeats "Viuapanya" for class D; the app labels it *Viuagugu* (herbicides). |
| 6.3 | Improved seed per crop: need, varieties, use (QDS / certified) | Input | Not recorded today. A future option: an "improved seed" record type. |
| 7 | Livestock population (indigenous, improved beef/dairy, total, registered; cattle, sheep and goats by class; other animals; poultry) | Input + carry-over | A census table. |
| 8 | Livestock infrastructure (slaughter slabs, butcheries, dips, crushes, dams, troughs…): working, broken, need, registered, reason | Input + carry-over | Not pre-filled from the slaughterhouse register yet (planned). |
| 9 | Grazing land per animal type | Input + carry-over | |
| 10.1–10.2 | Planted pasture; crop residues | Input | |
| 11 | TV/radio stations and villages reached; farming programmes; phone networks and villages reached | Input + carry-over | |

---

## Behaviour (as built)

**When reports appear**
- **Quarterly:** appears from the 15th of the quarter's last month (Sep, Dec, Mar, Jun) and is due by the 7th of the next month. It stays visible, marked late, until sent.
- **Annual:** appears from 1 June (the financial year ends in June) and is due by 7 July.
- **Monthly:** as today.
- The form (and its tab/card) only shows from the window's opening day. After sending it stays visible until 3 days past the due date; if HQ returns it, it shows again.
- First periods: **Q2 2026/27** (Oct–Dec 2026) and **FY 2026/27**. Earlier periods never show as late.
- Training records gained **days** and **trainer** fields (used in quarterly 3.1).

**Carry-over (annual inventory tables: 7, 8, 9, 11 and similar)**
- Pre-filled from last year's annual answers and marked "kutoka mwaka jana" until the officer taps **Ni sahihi** or edits a value.

**SACCO and group tables (quarterly 2.1, 2.2):** the docx did not give their columns; the current columns are provisional and need checking against a printed form.

**Officer additions (all three reports)**
- Every table built from records gets an **"Ongeza taarifa"** option. The officer can add rows or fill cells for work that wasn't recorded at the time.
- Monthly: the same, from the **"Ongeza taarifa ambazo hazikurekodiwa"** button on the monthly report.
- Each added cell is marked ✎ (amber in Word), and HQ sees that marker. Totals are recalculated.
- Additions only: an addition can't overwrite a value that came from a record.
- Values from records are not edited directly. To change one, the officer either adds a missing record or adds a correcting row with a note, so the report always traces back to its source.

**Sending:** same flow as monthly: send, reopen for correction, resend, and auto-send on the 7th (20:30 UTC). Auto-send uses the existing monthly auto-send switch, which now covers all ARDS forms.

**Deploy order:** backend first. An old backend rejects the new review record types and the quarterly/annual submission kinds.
