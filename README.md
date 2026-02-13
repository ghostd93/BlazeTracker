# BlazeTracker

## Fork Note (ghostd93)

This fork keeps BlazeTracker's core tracking behavior and adds focused performance and diagnostics improvements:

- Maximum Concurrent Requests setting in Advanced Settings
- Batched per-character extraction for position/activity, mood/physical, and outfit updates
- Extraction telemetry logging (prompt attempts/retries/results, skipped extractors, section durations)
- API failure reason logging (error type/status/code details in logs + telemetry prompt reasons)
- Per-prompt cooldown/backoff for unstable prompts (currently `topic_tone_change`)
- Prompt-result cache for unchanged prompt windows (skips duplicate extractor calls)
- Conservative token caps for short-response event prompts (`location_change`, `tension_change`, `presence_change`, `chapter_ended`)
- Deduplicated per-run relationship pairs so duplicate character entries don't double-request the same pair
- Strict JSON-repair pass before retrying when a response almost parses successfully
- Telemetry view now lists the latest skipped extractors (name + reason) directly in Advanced Settings
- Optional "Check tracker consistency" action that asks the AI to verify the tracker state against the latest messages
