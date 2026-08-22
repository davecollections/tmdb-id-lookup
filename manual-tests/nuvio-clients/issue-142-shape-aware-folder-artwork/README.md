# Issue #142 owner review

Import `owner-review.json` through the normal Builder startup route. The names are review labels only; behavior remains exact source-identity and published-authority based.

The prepared Collections are:

- **Shape-aware artwork — Poster siblings** — all saved sibling shapes are Poster.
- **Shape-aware artwork — Landscape siblings** — all saved sibling shapes are Landscape, including one reverse-direction People example.
- **Shape-aware artwork — mixed siblings** — saved siblings are already mixed.
- **Shape-aware artwork — ambiguous** — no exact Folder identity can be resolved.

Review in this order:

1. Open **People — curated both orientations**. Its saved Focus switch is off. Poster → Landscape must switch both the exact Tile draft and exact Focus draft to their published Landscape candidates without enabling Focus. Landscape → Poster must switch both URLs back. No saved card, revision, or export changes before Apply.
2. Cancel and reopen that Folder. The saved Poster shape, Poster Tile URL, Poster Focus URL, and disabled Focus state must return. Repeat Poster → Landscape and Apply; shape plus both URLs save in one normal revision while Focus stays disabled.
3. Open **People — curated Landscape start** under the Landscape-sibling Collection. Landscape → Poster must switch both exact URLs to Poster and back again while Focus stays enabled. Then open **Network — curated both orientations** and repeat its Tile-only directions.
4. Open **Studio — Landscape only** under the Landscape-sibling Collection. Landscape → Poster must retain the exact Landscape URL and show both directly beneath Tile shape, in this order:
   - `Curated Poster artwork isn't available for this folder, so the current tile artwork will be kept.`
   - `Other folders in this collection use Landscape tiles.`
   Neither notice appears beneath the Tile URL. Apply remains enabled. No **Request artwork** action appears while Tile is populated.
5. In the same Studio draft, clear Tile. The missing-orientation notice must disappear and unsupported Studio Poster remains quiet. The sibling notice remains because it describes the explicit shape choice. Switch back to Landscape while blank to confirm #140 assistance recalculates without auto-filling.
6. Open **Custom artwork — preserve** and **TMDB fallback — preserve**. Shape changes must retain each URL exactly and show no curated-orientation notice.
7. Open **Blank artwork — #140 assistance**. Shape changes must leave Tile blank while **Use curated artwork** / **Request artwork** eligibility recalculates for the new shape.
8. Open **Siblings — consistent Poster** and explicitly select Landscape. The calm copy `Other folders in this collection use Poster tiles.` must appear without changing siblings or blocking Apply.
9. Open **Siblings — already mixed** and change shape. No sibling-consistency notice appears.
10. Open **Imported mismatch — explicit interaction only**. Opening alone must preserve saved Poster plus exact curated Landscape with no notice or rewrite. An explicit change to Landscape leaves the already-matching URL unchanged; returning to Poster selects the exact Poster counterpart.
11. Open **Ambiguous — preserve**. Its curated-looking URL cannot establish authority; shape changes preserve it exactly with no curated-orientation notice.

Every Folder includes either a `reviewSentinel` or an intentionally simple sibling shape. Cancel must remain zero mutation, Apply must remain touched-only, `focusGifEnabled` must change only through its own switch, and no Builder-only provenance may appear in serialized output.
