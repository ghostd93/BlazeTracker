# BlazeTracker

## Fork Note (ghostd93)

This fork keeps BlazeTracker's core tracking behavior and adds focused performance and diagnostics improvements:

- Maximum Concurrent Requests setting in Advanced Settings
- Batched per-character extraction for position/activity, mood/physical, and outfit updates
- Extraction telemetry logging (prompt attempts/retries/results, skipped extractors, section durations)
- API failure reason logging (error type/status/code details in logs + telemetry prompt reasons)
- Per-prompt cooldown/backoff for unstable prompts (currently `topic_tone_change`)
- Prompt-result cache for unchanged prompt windows (skips duplicate extractor calls)
