# BlazeTracker 🔥

A SillyTavern extension that uses LLM analysis to track and maintain scene state across roleplay conversations. Helps AI models stay consistent with physical positions, outfits, time of day, mood, narrative tension, relationships, and story progression.

## Examples

### Compact View

![](./img/screenshot.png)

### Detailed View

![](./img/detailed_screenshot.png)

## Installation

### Requirements
- SillyTavern 1.12.0 or later
- Git installed on your system

### Install via SillyTavern
1. Open SillyTavern
2. Go to **Extensions** → **Install Extension**
3. Paste the repository URL:
   ```
   https://github.com/lunarblazepony/BlazeTracker
   ```
4. Click **Install**
5. Reload SillyTavern

### Manual Installation
1. Navigate to your SillyTavern installation
2. Go to `data/<user>/extensions/` (or `public/scripts/extensions/third-party/` for all users)
3. Clone the repository:
   ```bash
   git clone https://github.com/lunarblazepony/BlazeTracker
   ```
4. Restart SillyTavern
5. See Configuration to get started

## Features

### Scene State Tracking
- **Time**: Full narrative date and time tracking (year, month, day, hour, minute, day of week) with intelligent inference from scene context
- **Location**: Area, place, position, nearby props
- **Climate**: Weather and temperature (informed by time/season)
- **Characters**: Position, activity, mood, physical state, outfit (head, neck, jacket, back, torso, legs, underwear, socks, footwear)

### Intelligent Time Tracking
BlazeTracker uses a dedicated LLM call to track narrative time:
- **Initial extraction**: Infers date/time from scene context (weather, lighting, activities, seasonal clues)
- **Delta tracking**: Detects time jumps in subsequent messages ("an hour later", "the next morning", travel time, etc.)
- **Leap detection**: Prevents "double sleep" issues where parallel actions are interpreted as sequential (e.g., two characters sleeping doesn't advance time twice)
- **Automatic day-of-week**: Calculated from the date, so it's always consistent

### Scene Context
- **Topic**: What the scene is about (3-5 words)
- **Tone**: Emotional quality of the scene (2-3 words)
- **Tension**:
  - Level: relaxed → aware → guarded → tense → charged → volatile → explosive
  - Direction: escalating, stable, or decreasing
  - Type: confrontation, intimate, vulnerable, celebratory, negotiation, suspense, conversation

### Events & Story Tracking
BlazeTracker extracts significant narrative events from each assistant message:
- **Event Types**: conversation, confession, argument, discovery, secret_shared, emotional, intimate_touch, intimate_kiss, combat, betrayal, and many more
- **Witnesses**: Characters present during the event
- **Relationship Signals**: Attitude changes and milestones detected from events
- Events are accumulated through the current chapter and archived when a chapter ends

### Relationships
Track how characters feel about each other with bidirectional relationship modeling:
- **Status Levels**: strangers → acquaintances → friendly → close → intimate (also: strained, hostile, complicated)
- **Attitudes**: Each character's feelings, secrets, and wants toward the other
- **Milestones**: First meeting, first kiss, confession, betrayal, reconciliation, and more
- **Version History**: Full relationship history with snapshots at each change, tied to message IDs
- **Per-Message View**: Each message's "View Details" shows relationships as they were at that point in time
- **Rollback Support**: Re-extracting or swiping automatically rolls back relationship changes from that message
- Relationships are automatically initialized when new character pairs appear and updated based on events

### Chapters
Organize your narrative into chapters:
- **Automatic Detection**: Chapter boundaries detected on major location or time changes
- **Manual Control**: Force chapter breaks with `/bt-chapter` command
- **Chapter Data**: Title, summary, time range, primary location, events, outcomes
- **Tension Graph**: Visual representation of tension across all events

### Narrative Overview Modal
Click the 📖 button to open the Narrative Overview with three tabs:
- **Events**: Current chapter events with type icons, tension indicators, and relationship signals
- **Chapters**: Chapter history with summaries, events, and a tension graph over time
- **Relationships**: All tracked relationships with status, feelings, milestones, and filtering by present characters

### Smart Extraction
- Modular extraction pipeline: Time → Location → Climate → Characters → Scene → Event
- Each extractor has its own optimized prompt and temperature setting
- Scene and event analysis run after assistant responses (when both sides of the conversation are available)
- Delta-based updates - only changes what actually changed
- Grounded in character cards and lorebook for accuracy
- Swipe-aware storage - each swipe maintains its own state
- Removed clothing is automatically moved to location props

### Custom Prompts
All extraction prompts are fully customizable for different models and RP styles:
- Prompts for: time, location, climate, characters, scene, events, relationships, milestones
- Each prompt documents available placeholders ({{messages}}, {{schema}}, {{previousState}}, etc.)
- Reset to defaults at any time
- Tune prompts to improve extraction accuracy for your specific use case

### Context Injection
- Automatically injects current scene state into the prompt
- Full date/time included (e.g., "Monday, June 15th, 2024 at 2:30 PM")
- Active relationships and current events included
- Helps the AI maintain consistency without manual reminders

### Visual Display
- Inline state display below (or above) each message
- Date and time shown in compact format (e.g., "Sun, Dec 15 2024, 17:00")
- Climate with weather icons (☀️ sunny, ☁️ cloudy, ❄️ snowy, 🌧️ rainy, 💨 windy, ⛈️ thunderstorm)
- Tension visualized with icons (☕ relaxed, 👁 aware, 🛡 guarded, 😬 tense, ⚡ charged, 🔥 volatile, 💥 explosive)
- Direction indicators (📈 escalating, ➖ stable, 📉 decreasing)
- Expandable details for characters and props
- Character cards show relationship badges with present characters
- Step-by-step progress indicator during extraction

### Manual Editing
- Full state editor UI
- Edit any field: date, time, location, characters, outfits, tension
- Date picker with automatic day-of-week calculation
- Add/remove characters

### Slash Commands
BlazeTracker provides STScript commands for automation:
- `/bt-extract [id=N]` - Extract state for a specific message (defaults to most recent)
- `/bt-chapter [title="..."]` - Force a chapter break with optional custom title
- `/bt-extract-all` - Clear all state and re-extract the entire chat
- `/bt-status` - Show extraction status (messages, chapters, relationships, events)

## Configuration

Open the BlazeTracker settings panel in SillyTavern's Extensions menu.

### Connection Profile
- You will need to choose a connection profile to use BlazeTracker
- The easiest way to get a connection profile is to go to the connection menu, then at the top, press the 'Add' button, it will auto-populate the chat template etc from your current settings.
- **IMPORTANT**: Make sure to uncheck 'Start reply with' if you have it set up for your roleplays.
- You will need to refresh the page after creating a Connection Profile for it to show up in the Extensions settings.

### Auto-Extraction Mode
- **Off**: Manual extraction only (click 🔥 button)
- **Responses**: Auto-extract after AI messages
- **Inputs**: Auto-extract after your messages
- **Both**: Auto-extract after all messages

### Max messages to Include
The extension will automatically include X most recent messages since the last state, this allows you to set a maximum.

### Max Response Tokens
Number of tokens for the state response, default is 4,000. A block with 2 characters is usually about 1000 tokens.

### State Display Position
- **Above message**: Show the state block above the message
- **Below message**: Show the state block below the message

### Enable Time Tracking
When enabled, BlazeTracker makes an additional lightweight LLM call per message to track narrative time:
- First message: Extracts full date/time from scene context
- Subsequent messages: Extracts time delta (how much time passed)

This is a fast operation (~100-150 tokens in, ~20 tokens out) but can be disabled if you don't need time tracking or want to reduce API calls.

### Leap Threshold (minutes)
Prevents the "double sleep" problem. If two consecutive messages both contain time jumps larger than this threshold, the second jump is capped.

**Example**: Character A sleeps (8 hours). Character B also sleeps (8 hours). Without leap detection, this would advance time 16 hours. With a 20-minute threshold, the second sleep is capped to 20 minutes since it's assumed to be parallel action.

Default: 20 minutes. Increase if your RP legitimately has back-to-back large time skips.

### Temperature Unit
Display temperatures in Fahrenheit or Celsius. The LLM always extracts in Fahrenheit internally; this setting only affects display.

### Time Format
- **24-hour**: Display as 14:30
- **12-hour**: Display as 2:30 PM

### Enable Event Tracking
When enabled, BlazeTracker extracts significant narrative events from each assistant message. Events track what happened, who was involved, and relationship implications.

### Enable Relationship Tracking
When enabled, BlazeTracker tracks relationships between character pairs. Relationships are automatically initialized when new pairs appear and updated based on events.

### Custom Prompts
Click to expand the Custom Prompts section to view and edit extraction prompts:
- Click any prompt to open the editor
- View available placeholders and their descriptions
- Edit the prompt text to tune for your model
- Save to apply changes, Reset to restore defaults
- Customized prompts show a pencil icon

## Usage

### Automatic Mode
With auto-extraction enabled, state is extracted after each message. A progress indicator shows which extraction step is running (Time → Location → Climate → Characters → Scene).

#### Note: Manual Editing
I usually like to edit the state after the first assistant message, since it will make a bunch of assumptions that may or may not be true for your roleplay. This isn't required, but setting the initial state manually will help to keep the roleplay coherent.

### Manual Mode
1. Click the 🔥 button in the '...' menu on any message to extract state
2. Click the ✏️ button in the '...' menu to manually edit state

### Swipes
Each swipe maintains its own state. When you swipe to a new response, BlazeTracker will:
1. Show the existing state if previously extracted
2. Auto-extract if enabled and no state exists
3. Update the injected context to match the current swipe

## How It Works

BlazeTracker uses a modular extraction pipeline with specialized extractors:

1. **Time Extraction**: If enabled, extracts narrative date/time (initial) or time delta (subsequent). Temperature: 0.3
2. **Location Extraction**: Extracts area, place, position, and props. Uses time context. Temperature: 0.5
3. **Climate Extraction**: Extracts weather and temperature. Uses time and location for inference. Temperature: 0.3
4. **Character Extraction**: Extracts all character states including outfits. Temperature: 0.7
5. **Scene Extraction**: Extracts topic, tone, and tension. Only runs on assistant messages. Temperature: 0.6
6. **Event Extraction**: Extracts significant events with relationship signals. Only runs on assistant messages. Temperature: 0.7
7. **Relationship Initialization**: Automatically initializes new character pair relationships. Temperature: 0.6
8. **Chapter Detection**: Checks for chapter boundaries based on location/time changes.

Each extractor:
- Has its own optimized prompt (customizable in settings)
- Uses appropriate temperature for its task (deterministic for time/climate, creative for characters/events)
- Receives relevant context from previous extractors (e.g., climate knows the time and location)

After extraction:
- **Per-message State**: Stored in `message.extra.blazetracker` for each message/swipe
- **Narrative State**: Chapters and relationships (with version history) stored in message 0
- **Relationship Versioning**: Each relationship change creates a version snapshot with the message ID, enabling per-message relationship views and rollback on re-extraction
- **Injection**: The most recent state is formatted and injected into the prompt context
- **Display**: React components render the state inline with each message

## Building from Source

```bash
# Clone the repository
git clone https://github.com/lunarblazepony/BlazeTracker
cd BlazeTracker

# Install dependencies
npm install

# Build
npm run build

# Development (watch mode)
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format

# Output appears in dist/
```

## Upgrading from Older Versions

### Legacy Data Migration
When opening a chat with BlazeTracker data from an older incompatible version (before relationship versioning was added), you'll see a migration popup with three options:

1. **Re-extract All State** (slow, accurate) - Clears all existing state and re-extracts every message from scratch. Best for important chats where you want accurate relationship history.

2. **Re-extract Recent State** (fast) - Clears all existing state but only extracts the most recent message. Good enough for most cases where you just want to continue the chat.

3. **Initialize Empty State** - Creates an empty narrative state without re-extracting. Old per-message state will be ignored. New state will build from future messages.

### Automatic State Migration
When opening chats with compatible but older state formats, BlazeTracker automatically migrates the data:
- **v1 → v2**: Adds version history to existing relationships (creates initial version snapshot from current state)

These migrations happen silently and preserve your existing data.

## Troubleshooting

### State not extracting
- Check that your API is connected and working
- Check that a Connection Profile is selected in settings
- Check browser console for errors

### Extraction seems slow
- BlazeTracker makes multiple sequential LLM calls per extraction (time + location + climate + characters + scene + event + relationships)
- Each call is small (~100-300 tokens), but latency adds up
- Disable individual tracking features you don't need to reduce calls

### Old state showing after swipe
- This is usually a timing issue - state should update within a moment
- Try clicking the extract button manually

### Time seems wrong
- The initial time is inferred from context clues (weather, lighting, activities). If the scene doesn't have clear indicators, it may guess wrong.
- Use the editor to correct the initial date/time - subsequent deltas will be applied correctly from there.

### Double time advancement
- If time is advancing too fast (e.g., both characters sleeping advances time twice), try lowering the Leap Threshold setting.
- The default 20 minutes works well for most scenarios.

### Extraction accuracy issues
- Different models respond differently to prompts
- Use Custom Prompts to tune extraction for your specific model
- Add more explicit instructions if fields are being ignored
- Adjust the field descriptions in your custom prompts

### Relationships not appearing
- Relationships are only tracked when at least 2 characters are present
- Check that relationship tracking is enabled in settings
- New character pairs are initialized one at a time per extraction to avoid slowdown

### Events not being extracted
- Events only extract on assistant messages (not user messages)
- Event tracking must be enabled in settings
- The LLM may determine no significant event occurred (routine conversation)

### Chapter not ending
- Automatic chapter breaks require both a major location/area change AND sufficient time passage
- Use `/bt-chapter` to manually force a chapter break
- Check that events exist in the current chapter (chapters need events to finalize)

### Extension not appearing
- Ensure you have the latest SillyTavern version
- Check that the extension is enabled in Extensions → Manage Extensions

## License

Copyright (c) 2026 Lunar Blaze

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Contributing

Contributions welcome! Please open an issue or PR on GitHub.

## Acknowledgements

- [SillyTavern](https://github.com/SillyTavern/SillyTavern) team for the extensible platform
- [WTracker](https://github.com/bmen25124/SillyTavern-WTracker) for exposing me to the idea of a tracker
- Font Awesome for icons
