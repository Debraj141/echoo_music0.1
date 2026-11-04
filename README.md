# Echo — Language-Steerable Music Discovery

A frontend music discovery prototype inspired by natural-language recommendation systems.

## Files
- `index.html` — page structure and recommendation controls
- `style.css` — responsive dark-green visual design
- `script.js` — catalogue search, semantic ranking, feedback learning, playback and voice commands

## Run locally
1. Keep all three app files in the same folder.
2. Open the folder in VS Code.
3. Run `index.html` with the Live Server extension.
4. Use Chrome or Edge for the best voice-recognition support.

## Try it
- `Something calm for a 3 a.m. study session`
- `Upbeat music for a gym workout`
- `Melancholy indie music for a rainy evening`
- `Jazz for a quiet coffee shop`

Use **Discover** or the recommendation box for natural-language requests. Use **Search music** when you want direct catalogue results; the selector switches between songs and music videos. Home mood shortcuts generate recommendations, while Explore mood cards show matching catalogue results. Play previews from a track card or the fixed player.

## Discovery modes
- **Familiar** ranks artists and genres you have liked or replayed more highly.
- **Non-habitual** downranks artists and genres already present in your listening patterns to encourage exploration.

## Recommendation approach
1. Interpret the prompt into mood/context concepts and catalogue search terms.
2. Search the public iTunes Search API for candidate tracks.
3. Generate a deterministic Echo Semantic ID from each track's title, artist and genre.
4. Rank candidates against the prompt and selected discovery mode.
5. Generate a short explanation from track metadata and local preference signals.
6. Update a local preference profile from like, skip and replay actions.

## Important limitations
This is a frontend app with a local, language-steerable recommendation heuristic—not a connection to Spotify, NEO, GLIDE, a production LLM, RLHF or DPO. It needs no AI-provider key; catalogue metadata and previews require an internet connection to the public iTunes Search API. Semantic IDs are locally generated metadata hashes, not Spotify IDs or vector embeddings. Explanations are template-based, and preference tuning is a lightweight local heuristic rather than a trained model. iTunes preview availability and duration vary; it does not provide unlimited full-length streaming. Data is stored in browser `localStorage`.
