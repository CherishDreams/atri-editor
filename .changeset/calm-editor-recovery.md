---
'@atri-editor/core': patch
---

Preserve JSON attributes, selection and editable state when rebuilding NodeViews, including custom inline nodes and failed base64 uploads. Abort removed uploads, restart them on history restoration, and isolate callbacks from older attempts.

Track AI request targets through transactions, reject invalidated results through `AIResultInvalidatedError`, and stop late responses and callbacks after cancellation or destruction. Keep empty results inert and preserve literal text and whitespace.

Enforce readonly toolbar and panel behavior, close stale AI command menus, correct fixed floating panel coordinates, and constrain table menus on mobile. Round-trip escaped attachment names and complex URLs through the existing Markdown syntax without decoding encoded URLs.
