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
and must contain at least 32 characters. Never reuse, expose, log, or commit either
value.

Production was manually updated with the People service-token behavior on
2026-08-06 before the matching repository change. Once the synchronizing change
is merged, this tracked source is again the authoritative record. Merging a source
change does not deploy the Worker; deployment remains a separate explicit
operator action.

## Deploying Manually

For now, deployment is manual:

1. Open the Cloudflare Worker dashboard.
2. Open the TMDB proxy Worker.
3. Replace the Worker code with `tmdb-proxy.js`.
4. Confirm both required secrets still exist.
5. Deploy the Worker.

## Origin Rules

The Worker allows the live GitHub Pages site:

```text
https://davecollections.github.io
```

It also allows local development from any `localhost` or `127.0.0.1` port.

Browser requests remain controlled by this CORS allowlist and do not need the
People service token. The service-token header is intentionally absent from the
CORS allowed-header list because browser clients do not use it.

## People Service Access

An origin-free server-to-server request is accepted only when all of these are
true:

* the request is `GET`;
* `X-Nuvio-Service-Token` exactly matches the configured
  `NUVIO_PEOPLE_SERVICE_TOKEN` secret;
* the configured secret is a string containing at least 32 characters; and
* the pathname exactly matches `/3/person/{numeric ID}`.

The People generator uses this single request shape:

```text
GET /3/person/31?append_to_response=combined_credits,images
```

The query string is forwarded to TMDB, so the response can include Person
details, combined movie/TV credits, and official profile images. The pathname is
still `/3/person/31`; the separate `/3/person/31/combined_credits` route is
intentionally not service-token enabled. Search, Collection, Movie, TV, Keyword,
and every other route continue to require an allowed browser Origin even when a
valid service token is supplied.

The service-token header is used only for the Worker's access decision. It is not
forwarded to TMDB, returned in responses, or deliberately logged.

Missing, empty, short, or incorrect service credentials receive `403 Origin not
allowed` when no allowed browser Origin is present. Missing TMDB configuration
receives `500 TMDB token not configured`; upstream network failure receives `502
TMDB request failed`. Error responses remain `Cache-Control: no-store`.

To rotate the People credential, generate a new high-entropy value of at least 32
characters, update the Cloudflare Worker secret and the authorized generator's
secret through their protected operator interfaces, verify the exact Person
request, then retire the old value. Do not place either value in commands, logs,
issues, pull requests, documentation, or repository files.

## Allowed TMDB Paths

The Worker only proxies the TMDB paths the frontend needs:

* Person search, details, and combined credits
* Official movie collection search and details
* Movie search, details, and keywords
* TV search, details, and keywords
* Keyword search

If a frontend feature adds a new TMDB endpoint, update `ALLOWED_PATHS` here and redeploy the Worker.
