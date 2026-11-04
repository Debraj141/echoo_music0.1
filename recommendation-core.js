'use strict';

(function exposeRecommendationCore(root, factory) {
  const core = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (root) root.EchoRecommendation = core;
})(typeof globalThis === 'undefined' ? this : globalThis, function createRecommendationCore() {
  const RULES = [
    { mood: 'calm', terms: ['calm', 'peaceful', 'relax', 'ambient', 'meditation', 'sleep', 'soft', 'quiet', 'gentle'], query: 'ambient acoustic chill', energy: 0.2 },
    { mood: 'energetic', terms: ['energy', 'workout', 'gym', 'hype', 'upbeat', 'dance', 'aggressive', 'intense', 'running'], query: 'high energy workout rock hip hop', energy: 0.9, activity: 'workout' },
    { mood: 'melancholy', terms: ['sad', 'melancholy', 'heartbreak', 'emotional', 'lonely', 'rainy', 'blues'], query: 'melancholy indie acoustic', energy: 0.25 },
    { mood: 'romantic', terms: ['romantic', 'love', 'date', 'ballad', 'wedding'], query: 'romantic acoustic love songs', energy: 0.4 },
    { mood: 'focused', terms: ['study', 'focus', 'concentrate', 'reading', 'lofi', 'lo-fi', 'instrumental'], query: 'lofi instrumental study', energy: 0.25, activity: 'study' },
    { mood: 'celebratory', terms: ['party', 'dance', 'celebrate', 'club', 'disco'], query: 'dance party hits', energy: 0.85, activity: 'party' },
    { mood: 'laid-back', terms: ['jazz', 'cafe', 'café', 'coffee'], query: 'jazz cafe instrumental', energy: 0.35 }
  ];
  const GENRES = ['hip-hop', 'hip hop', 'rap', 'r&b', 'rnb', 'jazz', 'rock', 'metal', 'classical', 'country', 'reggae', 'afrobeats', 'latin', 'indie', 'electronic', 'folk', 'soul', 'pop', 'ambient', 'acoustic', 'blues', 'dance', 'soundtrack'];
  const LANGUAGES = ['English', 'Hindi', 'Spanish', 'French', 'Korean', 'Japanese', 'Arabic', 'Punjabi', 'Tamil', 'Telugu', 'Portuguese', 'German', 'Italian', 'Mandarin'];
  const STOP_WORDS = new Set(['something', 'completely', 'different', 'music', 'songs', 'song', 'that', 'with', 'for', 'the', 'and', 'want', 'like', 'give', 'find', 'play', 'some', 'session', 'recommend', 'discover', 'from', 'usual', 'me', 'my', 'a', 'an', 'of', 'to', 'in', 'on', 'it']);
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const normalizeWords = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, ' ').trim();
  const unique = values => [...new Set(values.filter(Boolean))];

  function inferTrackFeatures(track) {
    const source = normalizeWords([track.title, track.collection, track.genre].join(' '));
    const moods = unique(RULES.filter(rule => rule.terms.some(term => source.includes(term))).map(rule => rule.mood));
    const activities = [];
    if (/\b(study|focus|concentrat|reading)\b/.test(source)) activities.push('study');
    if (/\b(workout|gym|running|run|exercise|training)\b/.test(source)) activities.push('workout');
    if (/\b(meditat|yoga|breath)\b/.test(source)) activities.push('meditation');
    if (/\b(sleep|bedtime|relax|calm)\b/.test(source)) activities.push('relaxation');
    if (/\b(party|dance|celebrat|club)\b/.test(source)) activities.push('party');
    const energyRule = [...RULES].reverse().find(rule => rule.energy !== undefined && rule.terms.some(term => source.includes(term)));
    const instrumental = /\b(instrumental|karaoke|score|soundtrack|no vocals?)\b/.test(source);
    return {
      moods,
      activities,
      energy: energyRule ? energyRule.energy : null,
      vocals: instrumental ? 'instrumental' : 'unknown'
    };
  }

  function parseIntent(prompt) {
    const original = String(prompt || '').trim().slice(0, 1000);
    const source = normalizeWords(original);
    const matched = RULES.filter(rule => rule.terms.some(term => source.includes(term)));
    const moods = unique(matched.map(rule => rule.mood));
    const activities = unique([
      ...matched.map(rule => rule.activity),
      /\b(study|focus|concentrat|reading)\b/.test(source) ? 'study' : null,
      /\b(workout|gym|running|run|exercise|training)\b/.test(source) ? 'workout' : null,
      /\b(meditat|yoga|breath)\b/.test(source) ? 'meditation' : null,
      /\b(sleep|bedtime|relax|calm)\b/.test(source) ? 'relaxation' : null,
      /\b(party|dance|celebrat|club)\b/.test(source) ? 'party' : null
    ]);
    const genres = GENRES.filter(genre => source.includes(genre));
    const language = LANGUAGES.find(name => new RegExp(`\\b${name.toLowerCase()}\\b`, 'i').test(source)) || null;
    const tempo = /\b(fast|quick|uptempo|up-tempo)\b/.test(source) ? 'fast' : /\b(slow|slow-paced)\b/.test(source) ? 'slow' : null;
    const tags = unique([...matched.flatMap(rule => rule.terms.filter(term => source.includes(term))), ...genres]);
    const words = source.split(/\s+/).filter(word => word.length > 2 && !STOP_WORDS.has(word));
    const queries = unique(matched.map(rule => rule.query));
    if (language) queries.push(`${language} ${genres[0] || tags[0] || 'popular music'}`);
    return {
      search: (queries.length ? queries.slice(0, 2).join(' ') : words.slice(0, 5).join(' ')) || 'chill music',
      tags,
      moods,
      activities,
      genres,
      language,
      tempo,
      energy: [...matched].reverse().find(rule => rule.energy !== undefined)?.energy ?? inferRequestedEnergy(source),
      words,
      original,
      label: matched.length ? matched.map(rule => rule.mood).join(' and ') : `the language and ideas in “${original}”`
    };
  }

  function inferRequestedEnergy(source) {
    if (/\b(low energy|low-key|gentle|soft|calm)\b/.test(source)) return 0.2;
    if (/\b(high energy|energetic|intense|aggressive)\b/.test(source)) return 0.85;
    return null;
  }

  function normalizeIntent(candidate, prompt) {
    const base = parseIntent(prompt);
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new TypeError('Intent must be an object');
    const list = (value, limit = 12) => Array.isArray(value)
      ? unique(value.filter(item => typeof item === 'string').map(item => item.trim().slice(0, 48)).filter(Boolean)).slice(0, limit)
      : [];
    const energy = typeof candidate.energy === 'number' ? candidate.energy : NaN;
    return {
      search: typeof candidate.search === 'string' ? candidate.search.trim().slice(0, 160) || base.search : base.search,
      tags: list(candidate.tags),
      moods: list(candidate.moods),
      activities: list(candidate.activities),
      genres: list(candidate.genres),
      language: typeof candidate.language === 'string' ? candidate.language.trim().slice(0, 40) : base.language,
      tempo: ['slow', 'medium', 'fast'].includes(candidate.tempo) ? candidate.tempo : base.tempo,
      energy: Number.isFinite(energy) ? clamp(energy) : base.energy,
      words: base.words,
      original: base.original,
      label: typeof candidate.label === 'string' ? candidate.label.trim().slice(0, 180) || base.label : base.label
    };
  }

  function addVector(vector, key, weight) {
    if (key) vector[key] = (vector[key] || 0) + weight;
  }

  function textVector(text, weight, vector) {
    for (const token of normalizeWords(text).split(/\s+/)) {
      if (token.length > 2 && !STOP_WORDS.has(token)) addVector(vector, `term:${token}`, weight);
    }
  }

  function semanticRepresentation(track) {
    const vector = {};
    const features = inferTrackFeatures(track);
    const genre = normalizeWords(track.genre);
    const title = normalizeWords(track.title);
    const collection = normalizeWords(track.collection);
    textVector(track.title, 1.6, vector);
    textVector(track.collection, 0.8, vector);
    textVector(track.artist, 0.2, vector);
    textVector(track.genre, 1.2, vector);
    if (genre) addVector(vector, `genre:${genre}`, 2.4);
    for (const mood of features.moods) addVector(vector, `mood:${mood}`, 1.4);
    for (const activity of features.activities) addVector(vector, `activity:${activity}`, 1.3);
    if (features.energy !== null) addVector(vector, `energy:${features.energy <= 0.35 ? 'low' : features.energy >= 0.7 ? 'high' : 'medium'}`, 0.8);
    if (features.vocals === 'instrumental') addVector(vector, 'vocal:instrumental', 1);
    if (track.language && track.language !== 'unknown') addVector(vector, `language:${normalizeWords(track.language)}`, 1);
    const canonical = JSON.stringify({ title, artist: normalizeWords(track.artist), genre, collection, vector });
    return { version: 'echo-sparse-v1', facets: features, vector, semanticId: `SID-${hash(canonical)}` };
  }

  function intentRepresentation(intent) {
    const vector = {};
    textVector([intent.original, ...(intent.words || []), ...(intent.tags || [])].join(' '), 1, vector);
    for (const genre of intent.genres || []) addVector(vector, `genre:${normalizeWords(genre)}`, 2.4);
    for (const mood of intent.moods || []) addVector(vector, `mood:${normalizeWords(mood)}`, 1.4);
    for (const activity of intent.activities || []) addVector(vector, `activity:${normalizeWords(activity)}`, 1.3);
    if (intent.energy !== null && intent.energy !== undefined) addVector(vector, `energy:${intent.energy <= 0.35 ? 'low' : intent.energy >= 0.7 ? 'high' : 'medium'}`, 0.8);
    if (intent.language) addVector(vector, `language:${normalizeWords(intent.language)}`, 1);
    return { version: 'echo-sparse-v1', vector };
  }

  function cosineSimilarity(left, right) {
    const a = left && left.vector ? left.vector : left || {};
    const b = right && right.vector ? right.vector : right || {};
    const keys = Object.keys(a);
    let dot = 0, normA = 0, normB = 0;
    for (const key of keys) {
      normA += a[key] ** 2;
      if (Object.prototype.hasOwnProperty.call(b, key)) dot += a[key] * b[key];
    }
    for (const value of Object.values(b)) normB += value ** 2;
    return normA && normB ? clamp(dot / Math.sqrt(normA * normB)) : 0;
  }

  function createPreferences() {
    return { genres: {}, artists: {}, moods: {}, tags: {}, skipped: [], skippedTracks: [], replayed: [], interactions: [] };
  }

  function normalizePreferences(saved = {}) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
    const defaults = createPreferences();
    return {
      ...defaults,
      ...saved,
      genres: { ...(saved.genres || {}) },
      artists: { ...(saved.artists || {}) },
      moods: { ...(saved.moods || {}) },
      tags: { ...(saved.tags || {}) },
      skipped: Array.isArray(saved.skipped) ? [...saved.skipped] : [],
      skippedTracks: Array.isArray(saved.skippedTracks) ? [...saved.skippedTracks] : [],
      replayed: Array.isArray(saved.replayed) ? [...saved.replayed] : [],
      interactions: Array.isArray(saved.interactions) ? [...saved.interactions] : []
    };
  }

  function loadPreferences(storage, key = 'echo-preferences') {
    try {
      const saved = storage.getItem(key);
      return normalizePreferences(saved ? JSON.parse(saved) : {});
    } catch {
      return createPreferences();
    }
  }

  function savePreferences(storage, preferences, key = 'echo-preferences') {
    storage.setItem(key, JSON.stringify(normalizePreferences(preferences)));
  }

  function recordFeedback(preferences, track, action, at = Date.now()) {
    if (!track || !['like', 'save', 'skip', 'play', 'replay'].includes(action)) throw new TypeError('A track and valid feedback action are required');
    const result = normalizePreferences(preferences);
    const genre = String(track.genre || 'Music').toLowerCase();
    const artist = String(track.artist || 'Unknown artist').toLowerCase();
    const weight = action === 'replay' ? 3 : action === 'like' || action === 'save' ? 2 : action === 'play' ? 1 : 0;
    if (weight) {
      result.genres[genre] = (result.genres[genre] || 0) + weight;
      result.artists[artist] = (result.artists[artist] || 0) + weight;
      for (const mood of inferTrackFeatures(track).moods) result.moods[mood] = (result.moods[mood] || 0) + weight;
      result.tags[genre] = (result.tags[genre] || 0) + weight;
    }
    if (action === 'skip') {
      result.skipped = [String(track.id), ...result.skipped.filter(id => id !== String(track.id))].slice(0, 300);
      result.skippedTracks = [track, ...result.skippedTracks.filter(item => String(item.id) !== String(track.id))].slice(0, 100);
    }
    if (action === 'replay') result.replayed = [String(track.id), ...result.replayed.filter(id => id !== String(track.id))].slice(0, 300);
    result.interactions = [{ trackId: String(track.id), action, artist: track.artist || 'Unknown artist', genre: track.genre || 'Music', at }, ...result.interactions].slice(0, 500);
    return result;
  }

  function scoreTrack(track, intent, preferences, mode, candidateCounts = { artists: {}, genres: {} }) {
    const features = inferTrackFeatures(track);
    const text = normalizeWords([track.title, track.collection, track.artist, track.genre].join(' '));
    const artist = String(track.artist || '').toLowerCase(), genre = String(track.genre || 'Music').toLowerCase();
    const semantic = cosineSimilarity(semanticRepresentation(track), intentRepresentation(intent));
    const wordMatches = (intent.words || []).filter(word => word.length > 2 && text.includes(word)).length;
    const lexical = (intent.words || []).length ? wordMatches / Math.min(intent.words.length, 5) : 0;
    const promptRelevance = clamp(0.55 * lexical + 0.45 * semantic);
    const energyFit = intent.energy == null || features.energy == null ? semantic : clamp(1 - Math.abs(intent.energy - features.energy));
    const artistPreference = preferences.artists[artist] || 0;
    const genrePreference = preferences.genres[genre] || 0;
    const moodPreference = features.moods.reduce((sum, mood) => sum + (preferences.moods[mood] || 0), 0);
    const preferenceFromProfile = clamp((Math.min(artistPreference, 8) + Math.min(genrePreference, 8) + Math.min(moodPreference, 8)) / 24);
    const directPositive = preferences.interactions.reduce((sum, item) => {
      if (item.trackId !== String(track.id)) return sum;
      return sum + (item.action === 'like' || item.action === 'save' ? 1 : item.action === 'replay' ? 1.5 : item.action === 'play' ? 0.25 : 0);
    }, 0);
    const preference = clamp(0.7 * preferenceFromProfile + 0.3 * clamp(directPositive / 3));
    const artistCount = candidateCounts.artists[artist] || 1;
    const genreCount = candidateCounts.genres[genre] || 1;
    const recentlyPlayed = preferences.replayed.includes(String(track.id)) || preferences.interactions.some(item => item.trackId === String(track.id) && item.action === 'play');
    const novelty = clamp(0.55 * (artistPreference ? 0 : 1) + 0.25 * (genrePreference ? 0 : 1) + 0.1 * (recentlyPlayed ? 0 : 1) + 0.1 / artistCount);
    const skipped = preferences.skipped.includes(String(track.id));
    const similarSkipped = preferences.skippedTracks.filter(item => String(item.id) !== String(track.id) &&
      ((item.artist || '').toLowerCase() === artist ||
       ((item.genre || '').toLowerCase() === genre && inferTrackFeatures(item).moods.some(mood => features.moods.includes(mood))))) .length;
    const diversity = mode === 'familiar'
      ? clamp(0.65 * preference + 0.2 / artistCount + 0.15 / genreCount)
      : novelty;
    const base = mode === 'familiar'
      ? 0.3 * promptRelevance + 0.18 * semantic + 0.35 * preference + 0.12 * energyFit + 0.05 * diversity
      : 0.42 * promptRelevance + 0.18 * semantic + 0.05 * preference + 0.15 * energyFit + 0.2 * diversity;
    return base - (skipped ? 1 : 0) - Math.min(0.6, similarSkipped * 0.12);
  }

  function explainTrack(track, intent) {
    const facts = [];
    if (track.genre) facts.push(`catalogue genre ${track.genre}`);
    const titleFeatures = inferTrackFeatures({ title: track.title, collection: track.collection, genre: '' });
    if (titleFeatures.moods.length) facts.push(`title keywords suggest a ${titleFeatures.moods[0]} mood`);
    if (titleFeatures.activities.length) facts.push(`title keywords mention ${titleFeatures.activities[0]}`);
    if (titleFeatures.vocals === 'instrumental') facts.push('the title identifies it as instrumental');
    if (titleFeatures.energy !== null) facts.push(`title keywords suggest ${titleFeatures.energy <= 0.35 ? 'lower' : 'higher'} energy`);
    const uniqueFacts = unique(facts).slice(0, 3);
    const evidence = uniqueFacts.length ? uniqueFacts.join('; ') : 'available catalogue title and artist metadata';
    const overlap = (intent.genres || []).some(genre => normalizeWords(track.genre).includes(normalizeWords(genre))) ||
      (intent.moods || []).some(mood => titleFeatures.moods.includes(mood)) ||
      (intent.activities || []).some(activity => titleFeatures.activities.includes(activity));
    return `${evidence}. ${overlap ? 'This metadata overlaps with' : 'The available metadata provides a limited match for'} your request for ${intent.label}.`;
  }

  function rankTracks(tracks, intent, preferences, mode = 'familiar', limit = 12) {
    const counts = { artists: {}, genres: {} };
    for (const track of tracks) {
      const artist = String(track.artist || '').toLowerCase(), genre = String(track.genre || 'Music').toLowerCase();
      counts.artists[artist] = (counts.artists[artist] || 0) + 1;
      counts.genres[genre] = (counts.genres[genre] || 0) + 1;
    }
    const remaining = tracks.map(track => ({ ...track, score: scoreTrack(track, intent, preferences, mode, counts) }));
    const chosen = [];
    while (remaining.length && chosen.length < limit) {
      remaining.sort((a, b) => {
        const penalty = track => chosen.some(item => item.artist.toLowerCase() === track.artist.toLowerCase())
          ? (mode === 'nonhabitual' ? 0.18 : 0.08) : 0;
        return (b.score - penalty(b)) - (a.score - penalty(a));
      });
      chosen.push(remaining.shift());
    }
    return chosen.map(track => ({ ...track, reason: explainTrack(track, intent) }));
  }

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index++) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }

  return {
    createPreferences,
    cosineSimilarity,
    explainTrack,
    inferTrackFeatures,
    intentRepresentation,
    loadPreferences,
    normalizeIntent,
    normalizePreferences,
    parseIntent,
    rankTracks,
    recordFeedback,
    savePreferences,
    scoreTrack,
    semanticRepresentation
  };
});
