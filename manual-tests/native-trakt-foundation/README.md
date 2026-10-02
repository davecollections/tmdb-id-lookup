# Native Trakt foundation owner review (#279)

Import `owner-review.json` through the normal Builder JSON/file import. These three local contract examples do not represent resolved external Lists. No service, Preview or external artwork is needed.

1. Select **Local contract examples**. Movie and Series Sources should show **Native Trakt**, List 123, media and local sorting. The malformed Source remains **Preserved source**.
2. Open each supported Source menu: **Edit source** and **Delete** are present. The malformed Source has **Delete** only.
3. Edit a supported Source: **Source name** is the sole input. Trakt List ID, media and sorting are visible fixed context; there is no picker, sort control or Preview.
4. Save unchanged: no project-content revision should be introduced. Try a blank name: the normal required-name error focuses the input. Rename and save: only the title changes and the saved Source card receives focus. Cancel/Escape restores the original menu trigger.
5. Export and reimport: unknown/unsupported values survive; native Trakt never receives a `catalogSources` projection. New Collection, New Folder and Add Source still have no Trakt mode.

Review at 360px, 393px and desktop. The focused mounted check additionally covers 384/402/412px, short height, keyboard focus, forced colours and reduced motion through the existing source-edit harness. Physical-phone and actual Nuvio-client acceptance are separate owner evidence.
