# Image upload UI improvement

The user asked for all image upload fields to have a coherent design and actual previews. The vehicle upload control must sit with the top photo area rather than at the bottom of the specification form.

Use one shared React component with the existing MMS cream/charcoal surfaces, maroon accents and rounded panels. It supports keyboard-accessible browse, drag-and-drop, immediate local thumbnails, file names and sizes, removing selected files, and current-photo replacement/removal where the existing API permits it. Selections are saved with the existing form, not uploaded immediately. Validate the API's existing JPG/PNG/WebP and 5 MiB-per-file rules. Vehicles permit up to ten new images per request; other fields permit one. Revoke temporary preview URLs when files are removed or the component unmounts.

Scope: vehicle create/edit, tool create/edit, spare-part create/edit, user create/edit, profile and driver edit. Preserve existing File, FileList and File[] form contracts, backend removal flags, Cancel/refetch/retry behavior, authorization, and all pending main-flow fixes. Leave CSV imports as document controls. No new dependency, schema, upload endpoint, branch, commit, push or deployment is required.

- [x] Shared component with validation, previews, accessible controls and URL cleanup.
- [x] Vehicle upload at the top, integrated create/edit previews and existing gallery.
- [x] Profile, user and driver integration.
- [x] Tool and spare-part integration.
- [x] Meaningful browser checks for selection, replacement/removal, drag-and-drop, validation and multipart payloads.
- [x] Desktop/mobile visual review in both themes; final type, lint, format, build and complete browser gates.

Browser business writes must be intercepted or confined to the existing isolated clone. Freeze product sources before the final complete browser suite. The prior workspace run already passed 978 checks; repeat only suites affected by subsequent changes.
