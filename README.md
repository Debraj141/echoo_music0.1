# Echo — Language-Steerable Music Discovery

Echo is a small, dependency-free music-discovery MVP. It keeps the existing browser interface and adds an optional server-side LLM intent service, local semantic ranking, iTunes Search catalogue retrieval, and browser-persisted preference feedback.

## Run locally

Requirements: Node.js 20 or newer. No npm packages are requireD.

1. Copy `.env.example` to `.env`.
2. Set `LLM_API_KEY` to enable LLM intent parsing. Leave it empty to use the local fallback.
3. Optionally configure `LLM_BASE_URL` and `LLM_MODEL` for an OpenAI-compatible provider.
4. Start the server from this folder:

   ```sh
   node server.js
   ```

5. Open <http://localhost:3000>. Do not open `index.html` directly when using the backend; the frontend calls the same-origin `/api/intent` endpoint. If the endpoint is unavailable or unconfigured, it falls back to local intent parsing.

Run automated tests with:

```sh
node --test
```

The equivalent npm scripts are `npm start` and `npm test` (`npm.cmd start` / `npm.cmd test` in PowerShell when script execution is restricted).

## Configuration

Configuration is loaded from the process environment or a local `.env` file:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address; defaults to loopback |
| `NODE_ENV` | unset | Set to `production` for deployment; requires HTTPS provider URLs |
| `LLM_API_KEY` | unset | Secret bearer token for the configured model provider; server-side only |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `LLM_MODEL` | `gpt-4o-mini` | Provider model name |

The backend sends the prompt to `{LLM_BASE_URL}/chat/completions`, requests JSON output, validates and bounds the returned intent, and returns only structured intent fields to the browser. The key is never sent to or embedded in frontend code. For a local OpenAI-compatible service, use its loopback URL and a model name supported by that service. In production, use HTTPS and protect the server with the deployment platform's normal access controls.

## Recommendation pipeline

1. The browser sends the natural-language prompt to `POST /api/intent`.
2. When configured, the backend asks an OpenAI-compatible LLM to extract search terms, mood, activity, genres, language, tempo, and energy. Otherwise, or if the endpoint/provider fails, the browser uses the local rule-based parser.
3. The browser retrieves actual catalogue records from the public iTunes Search API.
4. `recommendation-core.js` creates a sparse semantic representation from track title, collection, artist, genre, and metadata-derived features. Cosine similarity matches that representation to the prompt intent; Familiar and Non-habitual modes apply different ranking weights, preference signals, and diversity penalties.
5. Each track keeps its catalogue `id` separate from a deterministic `SID-…` semantic metadata ID. Explanations cite available catalogue fields and label title-derived characteristics as inferences.
6. Likes, skips, play attempts, successful replays, and preference history are stored in browser `localStorage` and feed subsequent rankings.

## Catalogue, playback, and limitations

- Search and recommendations use the public iTunes Search API; music videos are also available from the search screen. Catalogue access and preview playback require an internet connection.
- iTunes does not consistently expose mood, BPM, language, or energy. Those fields remain unknown unless supplied, and the local feature inference is a heuristic from title/collection/genre—not measured audio analysis.
- The semantic representation is a local sparse metadata vector, not a learned embedding or third-party vector database. Semantic IDs are deterministic metadata signatures, not catalogue IDs.
- The LLM only interprets prompts; it does not supply or verify track metadata and does not rank or explain results. Without `LLM_API_KEY`, discovery remains rule-based. No real LLM provider was available in this repository, so live provider behavior must be verified with the operator's key/model configuration.
- iTunes previews may be unavailable, fail to play, or be shorter than a full track. Echo does not provide unlimited streaming.
- User libraries and preferences are local to the browser profile. This MVP has no account system, server-side user database, or cross-device sync.
- The backend uses a small in-memory per-IP rate limit and binds only to loopback by default. A public deployment needs appropriate proxy-aware rate limiting, authentication/access control, HTTPS, and operational monitoring.

## Files

- `index.html`, `style.css`, `script.js` — existing UI, styling, and browser behavior
- `recommendation-core.js` — shared intent, semantic representation, ranking, explanation, and feedback logic
- `server.js` — static file server and secure LLM proxy endpoint
- `tests/` — Node.js unit and backend tests
