# Collection preservation case manifest

Master: `206-collection-preservation-master.json`

SHA-256: `fdefa732786fdfebc63b297048b8ef5d75981d719c3fdeeb26cf2db10fa3d4b2`

35181 bytes; 6 collections; 24 folders; 68 physical sources; 2112 field/order rows.

Every original field value, including declared absences and deliberate ordering, is in `case-manifest.json` and the Original column of `comparison.md`. Fields are identified by case marker and original JSON path. Duplicate copies share one case marker and retain distinct occurrence paths.

All four manual routes: **Not tested**.

| Case | Purpose | Scope |
| --- | --- | --- |
| P206-S001 | GIF On with URL | Known field preservation |
| P206-F040 | GIF On with URL | Known field preservation |
| P206-S002 | GIF Off with URL | Known field preservation |
| P206-F010 | GIF Off with URL | Known field preservation |
| P206-S003 | GIF On without URL | Known field preservation |
| P206-F030 | GIF On without URL | Known field preservation |
| P206-S004 | GIF Off without URL | Known field preservation |
| P206-F020 | GIF Off without URL | Known field preservation |
| P206-S005 | DISCOVER MOVIE vote_count.desc | Known field preservation |
| P206-S006 | DISCOVER MOVIE popularity.desc | Known field preservation |
| P206-S007 | DISCOVER MOVIE primary_release_date.desc | Known field preservation |
| P206-S008 | DISCOVER MOVIE vote_average.desc | Known field preservation |
| P206-F100 | DISCOVER MOVIE sorts | Known field preservation |
| P206-S009 | DISCOVER TV vote_count.desc | Known field preservation |
| P206-S010 | DISCOVER TV popularity.desc | Known field preservation |
| P206-S011 | DISCOVER TV first_air_date.desc | Known field preservation |
| P206-S012 | DISCOVER TV vote_average.desc | Known field preservation |
| P206-F110 | DISCOVER TV sorts | Known field preservation |
| P206-S013 | COMPANY MOVIE vote_count.desc | Known field preservation |
| P206-S014 | COMPANY MOVIE popularity.desc | Known field preservation |
| P206-S015 | COMPANY MOVIE primary_release_date.desc | Known field preservation |
| P206-S016 | COMPANY MOVIE vote_average.desc | Known field preservation |
| P206-F120 | COMPANY MOVIE sorts | Known field preservation |
| P206-S017 | COMPANY TV vote_count.desc | Known field preservation |
| P206-S018 | COMPANY TV popularity.desc | Known field preservation |
| P206-S019 | COMPANY TV first_air_date.desc | Known field preservation |
| P206-S020 | COMPANY TV vote_average.desc | Known field preservation |
| P206-F130 | COMPANY TV sorts | Known field preservation |
| P206-S021 | NETWORK TV vote_count.desc | Known field preservation |
| P206-S022 | NETWORK TV popularity.desc | Known field preservation |
| P206-S023 | NETWORK TV first_air_date.desc | Known field preservation |
| P206-S024 | NETWORK TV vote_average.desc | Known field preservation |
| P206-F140 | NETWORK TV sorts | Known field preservation |
| P206-S025 | PERSON MOVIE vote_count.desc | Known field preservation |
| P206-S026 | PERSON MOVIE popularity.desc | Known field preservation |
| P206-S027 | PERSON MOVIE primary_release_date.desc | Known field preservation |
| P206-S028 | PERSON MOVIE vote_average.desc | Known field preservation |
| P206-F150 | PERSON MOVIE sorts | Known field preservation |
| P206-S029 | PERSON TV vote_count.desc | Known field preservation |
| P206-S030 | PERSON TV popularity.desc | Known field preservation |
| P206-S031 | PERSON TV first_air_date.desc | Known field preservation |
| P206-S032 | PERSON TV vote_average.desc | Known field preservation |
| P206-F160 | PERSON TV sorts | Known field preservation |
| P206-S033 | DIRECTOR MOVIE vote_count.desc | Known field preservation |
| P206-S034 | DIRECTOR MOVIE popularity.desc | Known field preservation |
| P206-S035 | DIRECTOR MOVIE primary_release_date.desc | Known field preservation |
| P206-S036 | DIRECTOR MOVIE vote_average.desc | Known field preservation |
| P206-F170 | DIRECTOR MOVIE sorts | Known field preservation |
| P206-S037 | DIRECTOR TV vote_count.desc | Known field preservation |
| P206-S038 | DIRECTOR TV popularity.desc | Known field preservation |
| P206-S039 | DIRECTOR TV first_air_date.desc | Known field preservation |
| P206-S040 | DIRECTOR TV vote_average.desc | Known field preservation |
| P206-F180 | DIRECTOR TV sorts | Known field preservation |
| P206-S041 | LIST original | Imported List filter preservation; use by the client is outside this test |
| P206-S042 | LIST vote_count.desc | Imported List filter preservation; use by the client is outside this test |
| P206-S043 | LIST vote_average.desc | Imported List filter preservation; use by the client is outside this test |
| P206-S044 | LIST primary_release_date.desc | Imported List filter preservation; use by the client is outside this test |
| P206-F190 | List order and imported List filters | Known field preservation |
| P206-S045 | Toy Story Collection List order | Known field preservation |
| P206-F200 | Native movie Collection | Known field preservation |
| P206-S046 | MOVIE canonical full filters | Known field preservation |
| P206-S047 | MOVIE matching aliases | Known field preservation |
| P206-S048 | MOVIE included AND expressions | Known field preservation |
| P206-F220 | MOVIE full filters and matching aliases | Known field preservation |
| P206-S049 | TV canonical full filters | Known field preservation |
| P206-S050 | TV matching aliases | Known field preservation |
| P206-S051 | TV included AND expressions | Known field preservation |
| P206-F230 | TV full filters and matching aliases | Known field preservation |
| P206-S052 | Explicit null filter fields | Known field preservation |
| P206-S053 | Empty string filter fields | Preservation probe; empty strings do not establish usable filter expressions |
| P206-S054 | Absent optional source fields | Known field preservation |
| P206-S055 | Explicit numeric zeros | Known field preservation |
| P206-S056 | Compound locale and network probe | Preservation probe; compound endpoint semantics are unverified |
| P206-S057 | Conflicting alias probe | Preservation probe; conflicting alias and unfamiliar imported field require review |
| P206-S058 | PERSON imported filters | Imported People filter preservation; no filter application claim |
| P206-S059 | DIRECTOR imported filters | Imported People filter preservation; no filter application claim |
| P206-F240 | Absent null empty zero and uncertain expressions | Known field preservation |
| P206-S060 | Identical copies, no distinct content | Known field preservation |
| P206-S061 | Distinct votes must survive | Known field preservation |
| P206-F090 | Duplicate copies and a distinct vote setting | Known field preservation |
| P206-S062 | Cinemeta movie source and compatibility projection | Known addon identity; imported title is a preservation probe |
| P206-S063 | Cinemeta series source and compatibility projection | Known addon identity; imported title is a preservation probe |
| P206-F210 | Addon sources and matching catalogSources | Known field preservation |
| P206-C030 | ROWS: pin On, glow Off, Show All Off | Known field preservation |
| P206-S064 | All artwork field control | Known field preservation |
| P206-F080 | Artwork populated: café & 東京 🎬 | Known field preservation |
| P206-C010 | Tabbed: false, true and null artwork | Known field preservation |
| P206-S065 | Null folder artwork control | Known field preservation |
| P206-F050 | All nullable artwork explicitly null | Known field preservation |
| P206-C050 | ROWS: empty backdrop and null folder artwork | Known field preservation |
| P206-C020 | Tabbed: pin On, glow On, absent backdrop | Known field preservation |
| P206-S066 | Empty folder artwork control | Known field preservation |
| P206-F060 | All artwork explicitly empty | Known field preservation |
| P206-C060 | Absent collection defaults; explicit empty folder artwork | Known field preservation |
| P206-S067 | Absent folder settings control | Known field preservation |
| P206-F070 | Absent presentation settings | Known field preservation |
| P206-C040 | Filters and absent folder defaults | Known field preservation |
