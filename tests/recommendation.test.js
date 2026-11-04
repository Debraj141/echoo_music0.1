'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../recommendation-core');

const tracks = [
  { id: 'song-1', title: 'Quiet Ambient Study', artist: 'Known Artist', genre: 'Ambient', collection: 'Focus Instrumentals' },
  { id: 'song-2', title: 'Peaceful Piano', artist: 'New Piano Artist', genre: 'Classical', collection: 'Calm Sessions' },
  { id: 'song-3', title: 'Aggressive Workout Rock', artist: 'Power Band', genre: 'Rock', collection: 'Gym Hits' },
  { id: 'song-4', title: 'Dance Party', artist: 'Dance Artist', genre: 'Electronic', collection: 'Club Mix' },
  { id: 'song-5', title: 'Ambient Rain Study', artist: 'Another Ambient Artist', genre: 'Ambient', collection: 'Study Music' },
  { id: 'song-6', title: 'Soft Acoustic Evening', artist: 'Acoustic Artist', genre: 'Acoustic', collection: 'Relaxing Guitar' }
];

test('parses mood, activity, energy, genre, language, and tempo', () => {
  const intent = Core.parseIntent('Aggressive hip-hop for an intense Hindi gym workout, fast tempo');
  assert.ok(intent.moods.includes('energetic'));
  assert.ok(intent.activities.includes('workout'));
  assert.equal(intent.energy, 0.9);
  assert.ok(intent.genres.includes('hip-hop'));
  assert.equal(intent.language, 'Hindi');
  assert.equal(intent.tempo, 'fast');
});

test('parses calm study prompts into a low-energy focused intent', () => {
  const intent = Core.parseIntent('Something calm for a 3 AM study session');
  assert.ok(intent.moods.includes('calm'));
  assert.ok(intent.moods.includes('focused'));
  assert.ok(intent.activities.includes('study'));
  assert.ok(intent.energy < 0.4);
});

test('creates a stable semantic ID separate from the catalogue track ID', () => {
  const representation = Core.semanticRepresentation(tracks[0]);
  assert.equal(representation.semanticId, Core.semanticRepresentation(tracks[0]).semanticId);
  assert.match(representation.semanticId, /^SID-[A-F0-9]{8}$/);
  assert.notEqual(representation.semanticId, tracks[0].id);
  assert.notEqual(representation.semanticId, Core.semanticRepresentation(tracks[1]).semanticId);
  assert.equal(representation.version, 'echo-sparse-v1');
});

test('semantic similarity favors tracks with relevant mood and metadata', () => {
  const intent = Core.parseIntent('calm ambient instrumental music for study');
  const aligned = Core.semanticRepresentation(tracks[0]);
  const unrelated = Core.semanticRepresentation(tracks[3]);
  assert.ok(Core.cosineSimilarity(aligned, Core.intentRepresentation(intent)) >
    Core.cosineSimilarity(unrelated, Core.intentRepresentation(intent)));
});

test('Familiar prioritizes learned artists and genres while Non-habitual explores alternatives', () => {
  let preferences = Core.createPreferences();
  for (let index = 0; index < 5; index++) preferences = Core.recordFeedback(preferences, tracks[0], 'like', index);
  const intent = Core.parseIntent('calm music');
  const familiar = Core.rankTracks(tracks, intent, preferences, 'familiar', tracks.length);
  const nonhabitual = Core.rankTracks(tracks, intent, preferences, 'nonhabitual', tracks.length);
  assert.equal(familiar[0].id, tracks[0].id);
  assert.notDeepEqual(familiar.map(track => track.id), nonhabitual.map(track => track.id));
});

test('Skip reduces the score of the skipped track and similar tracks', () => {
  const intent = Core.parseIntent('calm ambient study');
  const preferences = Core.recordFeedback(Core.createPreferences(), tracks[0], 'skip', 1);
  const candidateCounts = { artists: {}, genres: {} };
  const before = Core.scoreTrack(tracks[4], intent, Core.createPreferences(), 'familiar', candidateCounts);
  const after = Core.scoreTrack(tracks[4], intent, preferences, 'familiar', candidateCounts);
  assert.ok(after < before);
  assert.ok(Core.scoreTrack(tracks[0], intent, preferences, 'familiar', candidateCounts) < before);
});

test('Save and Replay increase matching preference signals by different strengths', () => {
  const intent = Core.parseIntent('calm ambient study');
  const baseline = Core.scoreTrack(tracks[0], intent, Core.createPreferences(), 'familiar');
  const saved = Core.recordFeedback(Core.createPreferences(), tracks[0], 'save', 1);
  const savedScore = Core.scoreTrack(tracks[0], intent, saved, 'familiar');
  const replayed = Core.recordFeedback(saved, tracks[0], 'replay', 2);
  const replayScore = Core.scoreTrack(tracks[0], intent, replayed, 'familiar');
  assert.equal(saved.genres.ambient, 2);
  assert.equal(replayed.genres.ambient, 5);
  assert.equal(replayed.artists['known artist'], 5);
  assert.equal(replayed.replayed[0], tracks[0].id);
  assert.ok(savedScore > baseline);
  assert.ok(replayScore > savedScore);
});

test('preference feedback persists and reloads from storage', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value)
  };
  const changed = Core.recordFeedback(Core.createPreferences(), tracks[2], 'skip', 100);
  Core.savePreferences(storage, changed);
  const reloaded = Core.loadPreferences(storage);
  assert.deepEqual(reloaded.skipped, ['song-3']);
  assert.equal(reloaded.interactions[0].action, 'skip');
});

test('recommendation explanations only cite track metadata and supported title inferences', () => {
  const intent = Core.parseIntent('quiet instrumental study music');
  const reason = Core.explainTrack(tracks[0], intent);
  assert.match(reason, /Ambient/);
  assert.match(reason, /title keywords/i);
  assert.doesNotMatch(reason, /BPM|English language|Spotify/);
});

test('normalizes LLM intent and falls back to local prompt words for user context', () => {
  const intent = Core.normalizeIntent({
    search: 'Hindi ambient study',
    tags: ['ambient', 1, 'focus'],
    moods: ['calm'],
    activities: ['study'],
    genres: ['ambient'],
    language: 'Hindi',
    tempo: 'slow',
    energy: 0.2,
    label: 'calm study music'
  }, 'quiet Hindi music for study');
  assert.deepEqual(intent.tags, ['ambient', 'focus']);
  assert.ok(intent.words.includes('quiet'));
  assert.equal(intent.energy, 0.2);
});
