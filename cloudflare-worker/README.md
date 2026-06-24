# TMDB Cloudflare Worker

This folder tracks the Cloudflare Worker source used by the live TMDB lookup proxy.

The Worker code is safe to keep in Git because it only references the secret name:

```js
env.TMDB_BEARER_TOKEN
```

Do not commit the actual TMDB bearer token.

## Required Cloudflare Secret

Set this Worker secret in the Cloudflare dashboard:

```text
TMDB_BEARER_TOKEN
```

The value should be the TMDB API read access token.

## Deploying Manually

For now, deployment is manual:

1. Open the Cloudflare Worker dashboard.
2. Open the TMDB proxy Worker.
3. Replace the Worker code with `tmdb-proxy.js`.
4. Confirm the `TMDB_BEARER_TOKEN` secret still exists.
5. Deploy the Worker.

## Origin Rules

The Worker allows the live GitHub Pages site:

```text
https://davecollections.github.io
```

It also allows local development from any `localhost` or `127.0.0.1` port.

## Allowed TMDB Paths

The Worker only proxies the TMDB paths the frontend needs:

* Person search, details, and combined credits
* Official movie collection search and details
* Movie search, details, and keywords
* TV search, details, and keywords
* Keyword search

If a frontend feature adds a new TMDB endpoint, update `ALLOWED_PATHS` here and redeploy the Worker.
