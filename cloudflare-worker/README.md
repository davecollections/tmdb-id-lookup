# TMDB Cloudflare Worker

This folder tracks the Cloudflare Worker source used by the live TMDB lookup proxy.

The Worker code is safe to keep in Git because it only references secret names:

```js
env.TMDB_BEARER_TOKEN
env.NUVIO_PEOPLE_SERVICE_TOKEN
```

Do not commit either secret value.

## Required Cloudflare Secrets

Set these Worker secrets in the Cloudflare dashboard:

```text
TMDB_BEARER_TOKEN
NUVIO_PEOPLE_SERVICE_TOKEN
```

`TMDB_BEARER_TOKEN` is the TMDB API read access token. `NUVIO_PEOPLE_SERVICE_TOKEN`
is a separate server-to-server credential for the `nuvio-people-assets` generator
and controlled Watch Provider automation. It must contain at least 32 characters.
Never reuse, expose, log, or commit either value.

Production was manually updated with the People service-token behavior on
2026-08-06 before the matching repository change. Once the synchronizing change
is merged, this tracked source is again the authoritative record. Merging a source
change does not deploy the Worker; deployment remains a separate explicit
operator action.

## Owner-only manual deployment

Codex never deploys the production Worker or requests its secrets. Codex prepares and fully tests the complete source, reports the exact deployment-handoff source-byte SHA-256 plus the branch/head, tracked Git blob identity, and checks, then stops. After separate approval, Dave performs the manual deployment:

1. Open the Cloudflare Worker dashboard.
2. Open the TMDB proxy Worker.
3. Replace the Worker code with `tmdb-proxy.js`.
4. Confirm both required secrets still exist.
5. Deploy the Worker.
6. Reply `Worker deployed` and provide the deployment/version identity when available so the approved live validation can begin.

The deployment-handoff SHA-256 identifies the exact reviewed byte sequence supplied for deployment. It is not interchangeable with the Git blob OID or a Windows working-tree SHA-256: Git stores normalized LF text while the working checkout may contain CRLF. A CRLF-only working-tree hash difference is not tracked-source divergence. See [`docs/v2/PROJECT_WORKFLOW.md`](../docs/v2/PROJECT_WORKFLOW.md) for the full gate.

## Origin Rules

The Worker allows the live GitHub Pages site:

```text
https://davecollections.github.io
```

It also allows local development from any `localhost` or `127.0.0.1` port.

Browser requests remain controlled by this CORS allowlist and do not need the
service token. This behavior is unchanged by the origin-free service access. The
service-token header is intentionally absent from the CORS allowed-header list
because browser clients do not use it.

## People And Watch Provider Service Access

An origin-free server-to-server request is accepted only when all of these are
true:

* the request is `GET`;
* `X-Nuvio-Service-Token` exactly matches the configured
  `NUVIO_PEOPLE_SERVICE_TOKEN` secret;
* the configured secret is a string containing at least 32 characters; and
* the pathname exactly matches `/3/person/{numeric ID}` or one of the three
  approved Watch Provider paths below.

The People generator uses this single request shape:

```text
GET /3/person/31?append_to_response=combined_credits,images
```

The query string is forwarded to TMDB, so the response can include Person
details, combined movie/TV credits, and official profile images. The pathname is
still `/3/person/31`; the separate `/3/person/31/combined_credits` route is
intentionally not service-token enabled.

Controlled automation may also use these exact origin-free request shapes:

```text
GET /3/watch/providers/regions?language=en-US
GET /3/watch/providers/movie?language=en-US
GET /3/watch/providers/tv?language=en-US
```

Each Watch Provider route still requires exactly one `language=en-US` parameter.
Missing, changed, duplicate, or additional parameters, including `api_key`, are
rejected by the existing TMDB request validator. Token access does not broaden
the TMDB path or query allowlist. Search, Collection, Movie, TV, Keyword,
Discover, unsupported Watch Provider paths, and every other route continue to
require an allowed browser Origin even when a valid service token is supplied.

The service-token header is used only for the Worker's access decision. It is not
forwarded to TMDB, returned in responses, or deliberately logged.

Missing, empty, short, or incorrect service credentials receive `403 Origin not
allowed` when no allowed browser Origin is present. Missing TMDB configuration
receives `500 TMDB token not configured`; upstream network failure receives `502
TMDB request failed`. Error responses remain `Cache-Control: no-store`.

To rotate the service credential, generate a new high-entropy value of at least
32 characters, update the Cloudflare Worker secret and each authorized service's
secret through their protected operator interfaces, verify the exact approved
requests, then retire the old value. Do not place either value in commands, logs,
issues, pull requests, documentation, or repository files.

## Allowed TMDB Paths

The Worker only proxies the TMDB paths the frontend needs:

* Person search, details, and combined credits
* Official movie collection search and details
* Movie search, details, and keywords
* TV search, details, and keywords
* Keyword search
* Exact Studio Movie and Series count/Preview requests using only
  `/3/discover/movie?with_companies={positive integer}` and
  `/3/discover/tv?with_companies={positive integer}`, optionally with one
  approved media-specific `sort_by` value for explicit title Preview
* Exact Network Series count/Preview requests using only
  `/3/discover/tv?with_networks={positive integer}`, optionally with one
  approved Network TV `sort_by` value for explicit title Preview
* Exact Streaming provider catalogue requests using only:
  * `/3/watch/providers/regions?language=en-US`
  * `/3/watch/providers/movie?language=en-US`
  * `/3/watch/providers/tv?language=en-US`

The Movie Company path accepts exactly one canonical positive-safe-integer
`with_companies` value and either no other parameter or exactly one `sort_by`
from `popularity.desc`, `primary_release_date.desc`, `vote_average.desc`, or
`vote_count.desc`. The TV Company path applies the same rule with
`popularity.desc`, `first_air_date.desc`, `vote_average.desc`, or
`vote_count.desc`. Query parameter order may vary. The TV Network path accepts
exactly one canonical `with_networks` value and either no other parameter or one
`sort_by` from those same four TV values. Company and Network allowlists remain
family-specific. Mixed, duplicate, malformed, wrong-media, unsupported, and
additional parameters fail closed. Other Discover filters and broad
`/3/discover/*` forwarding remain disallowed.

Each Streaming provider path requires exactly one `language=en-US` parameter.
Missing, duplicate, differently cased, or additional parameters fail closed.
The Worker remains a thin pass-through; Builder validates and combines the three
official response shapes in memory and caches only a successful catalogue for
the current workspace/session.

The tracked Network route was added for Builder issue #98. It was manually
deployed to the existing `tmdb-id-lookup-proxy` Worker and live validated on
2026-08-09 after separate explicit authorization.

The optional Company `sort_by` allowlist is tracked for Builder issue #124 so
one explicit Studio Preview response can supply both `total_results` and the
ordered first result page. After separate owner authorization, the exact
reviewed Worker source was manually deployed and its approved Company Movie/TV
no-sort and sort requests plus the rejection matrix were live validated on
2026-08-19. Worker deployment is independent of Builder publication; the
overall V2 Builder remains governed by its separate release and noindex boundary.

Builder Network hierarchy issue [#126](https://github.com/davecollections/tmdb-id-lookup/issues/126) extends only the Network TV route with the optional four-value `sort_by` allowlist above. On 2026-08-20 Dave manually deployed the complete reviewed source as version `f6bee241-afef-447f-b8f9-3d4b8da460cf`; the recorded deployment-handoff source SHA-256 is `612955AD3ECCEF16E12E05ABA6B672B0AD68BA825F13419FFA2A0A9346706AD4`. The merged tracked Worker Git blob is separately `ceb37bb3711a43d6f25508a98943ce71b53baec2`; these identities do not by themselves prove byte equality. The live production Worker/TMDB/image-CDN validation passed before [PR #127](https://github.com/davecollections/tmdb-id-lookup/pull/127) merged. Merge did not redeploy the Worker; automatic Pages publication is a separate workflow.

The tracked Streaming routes were added for Builder issue #104. Source changes
do not update the live Worker. Deployment and live provider acceptance require
separate explicit owner authorization; do not deploy these routes implicitly as
part of ordinary implementation, commit, push, PR, or local testing work.

If a frontend feature needs a new TMDB endpoint, prepare and test the appropriate narrow tracked allowlist change, report the exact handoff identities and evidence, then stop for separately authorised owner deployment.
