# Research module (planned)

Field photos, with the labels officers give them, are a dataset for research and for training systems that recognise pests and diseases. This module turns them into datasets without exposing the people involved.

## What is already in place

- **Collection.** Photos are taken in the field with the app's camera only. Gallery photos and files older than 10 minutes are refused. Each photo is shrunk to at most 1600 px JPEG on the phone, which also removes the camera's EXIF data.
- **Labels.** Each photo belongs to a record:
  - The "Picha" observation records what the photo shows, the crop or animal, what was seen, the suspected cause, severity and growth stage.
  - Other records (pest outbreaks, treatments) give the crop or animal and the problem.
  - `photoLabels()` in `@afisa/shared` turns either kind into one label set.
- **Consent.** The usage policy, agreed once per version by every officer, says work photos may be used for research and training without the officer's or farmer's name.
- **Access today.**
  - The officer owns their photos.
  - HQ sees a report's photos once the report is sent (`submissions.photosForHq`).
  - Root can list photos anonymised for a dataset (`research.photoDataset`):
    - no names or phone numbers;
    - time to the month;
    - location to the ward and about 10 km;
    - paged by creation time.

## The research app

A third app in this repo, beside `apps/field` and `apps/hq`:

```
apps/research/   # Vite + React + TS, same @afisa/ui and @afisa/shared
```

It uses the same Convex deployment and `@afisa/backend/api`, but only its own functions (`research.*`). Nothing there exposes officers' records or reports.

### Planned features

1. **Researcher role.** A global flag like root, but limited to `research.*` functions. It is granted by root and audited.
2. **Browse and filter.** Filter by section, category, crop or animal, suspected cause, region, ward and month. Show photo counts per label.
3. **Expert verification.** An expert confirms or corrects the label (for example "Fall armyworm, confirmed"). Each verification is stored with the expert and the date; the officer's original label is kept.
4. **Datasets.** A named, versioned set of photo ids and labels at a point in time, with a manifest (CSV/JSON) and a download of the images. A dataset never changes once published; corrections make a new version.
5. **Withdrawal.** A photo deleted by its officer, or removed by root, drops out of future dataset versions.

### Rules

- No officer or farmer names, phone numbers, or exact coordinates in anything the research app shows or exports.
- Every export is audited: who, which dataset version, when.
- Check the Personal Data Protection Act, 2022 before the first export outside the department.
