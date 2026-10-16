# Spare Parts Model Selection Implementation Plan

**Goal:** Let administrators choose FP-Growth or Eclat and run the supplied saved model from the maintenance screen.

**Design:** Add a themed model selection card above the co-replaced parts table in Maintenance → Predictive. FP-Growth is the default; changing the selection requires Run Model before results change. Identify the model and training sample behind each result. These association models recommend related parts; vehicle risk continues using the existing predictive model.

**Architecture:** Preserve the supplied pickle files and export their saved association rules to validated JSON assets, matching the existing TypeScript inference deployment. Add a read-only, admin/EVP-only analytics endpoint and a React Query hook. Keep the existing live-job-order association endpoint intact.

**Tech stack:** Python/pandas for offline export; TypeScript, Zod, Express, React Query, existing themed Select/Card/Button components for runtime.

## Constraints and review focus

- Work on main; reuse local web port 5174 and API port 3001.
- Preserve all four directional rules and their original support, confidence, and lift.
- Each supplied model has 21 training transactions; do not imply results use current job orders or retrain on Run Model.
- Do not invent model differences: both supplied models currently yield the same rules.
- Reject invalid algorithms and unavailable assets instead of silently running another algorithm.
- Keep draft selections separate from applied results; handle loading, errors, retry, filters, and narrow screens.
- Keep the existing live association endpoint and vehicle risk results unchanged.

## Tasks

- [x] Add failing API tests for both models, golden rule values, invalid algorithms, and authorization.
- [x] Preserve source pickles, add a restricted offline exporter, and verify JSON values against the originals.
- [x] Add shared result contracts, validated model loading, and the read-only endpoint.
- [x] Add a failing browser test for selection, explicit execution, error recovery, and confidence filtering.
- [x] Add the selector and results component using existing theme tokens and searchable dropdowns.
- [x] Run workspace tests/build, web lint, relevant browser regressions, and desktop/mobile visual checks.
- [x] Review the final diff and report the available screen and model limitations.

## Verification notes

- API endpoint tests first failed with 404, then passed 11/11 after implementation.
- Offline export tests first failed because the converter was absent, then passed for both source models with exact metrics and SHA-256 provenance.
- Browser tests first failed because the controls were absent; final checks passed 13/13, including draft/applied choices, both algorithms, cached-model reruns, error recovery, empty confidence filters, and mobile sizing.
- Workspace build, type checks, and web lint passed; light and dark desktop/mobile layouts were visually checked.
- An independent code review found no material issues; generated Python bytecode is ignored.
- Final workspace tests passed: 556 API, 10 shared, and 28 GPS gateway tests (594 total), including all five loader failure tests.
