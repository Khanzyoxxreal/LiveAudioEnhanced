# Live Audio Enhanced

GitHub: https://github.com/Khanzyoxxreal/LiveAudioEnhanced

A lightweight Chrome extension (Manifest V3) that helps you hear the quiet background music in
videos and livestreams on any website (YouTube, TikTok, Instagram, Facebook and more), for example
live performances where the singer's microphone is loud and the instrumental is faint.

Everything uses **traditional digital signal processing** in the Web Audio API, running locally in
your browser. There is no AI, no machine learning, no model download, no server and no uploads. The only
network request is the video thumbnail shown in the popup (see Privacy).

> **What it can and cannot do.** Live Audio Enhanced is an audio *enhancer*. It re-balances and shapes the
> sound that is still present in the stream. It cannot bring back music that was never mixed into
> the stream, and it does **not** separate vocals from instruments. Results depend on the stream.

## Features

- **Works on any website**: captures the audio of the current Chrome tab (YouTube, TikTok, Instagram, Facebook or any other page with sound) only when you press Start.
- **Bound to one YouTube video**: on YouTube, capture is tied to the video or livestream you started it on. It keeps running while you switch tabs, and stops automatically only when that tab's video id changes (or the tab leaves a video page). The exception is YouTube Shorts: scrolling from one Short to the next keeps capture running, like Facebook Reels or TikTok. On other sites it runs until you press Stop or close the tab.
- **Concert presets**: Concert Hall, Live Band, Acoustic, Stadium, EDM / Bass and Karaoke, tuned for live music and concerts.
- **Crowd & hall reduction**: a downward expander plus a high-frequency Side cut that turns down cheering, applause tails and room echo between the notes. Plain DSP, no AI.
- **Bass boost**: low shelf plus sub-bass punch, with automatic headroom compensation.
- **Stereo width**: widens the stereo image (no effect on mono sources).
- **Live spectrum view**: real-time spectrum bars (original and enhanced) in the status card, plus level meters.
- **Compact, clean interface**: a small 580px-wide popup. The video thumbnail and title sit at the top left with the start button and live spectrum; the right side has the preset dropdown and Mix, Equalizer and Advanced tabs (compressor, saved presets, reset).
- **Stereo music focus**: Mid/Side processing that lowers the centred 200 Hz-4 kHz range and raises the side signal, keeping bass, highs and stereo width intact.
- **Vocal reduction**: optional extra cut of the centred vocal range for stereo sources.
- **7-band equalizer**: Sub Bass to High, +/-12 dB per band, with automatic headroom compensation.
- **Harshness reduction**: gentle cut around 4.5 kHz plus a soft high-shelf cut.
- **Dynamic compressor**: threshold, ratio, attack, release and makeup gain with gentle defaults.
- **Safety limiter**: prevents hard clipping when boosting up to 150 % master volume.
- **Built-in presets**: Natural, Balanced, Music Focus, Vocal Friendly and Custom.
- **My presets**: save, load, update and delete up to 30 of your own presets.
- **Share presets**: export and import presets as plain text.
- **Real-time level meters**: input and output meters with peak hold and a CLIP indicator.
- **Audio enhancement toggle**: bypass the processing instantly to compare with the original.
- **Private and local**: traditional DSP in the Web Audio API, no AI, no server and no uploads of your audio.

## Install

### From GitHub

1. Download the latest `LiveAudioEnhanced-vX.Y.Z.zip` from the **Releases** page (or use **Code > Download ZIP**
   and open the extracted folder that contains `manifest.json`).
2. Follow the steps below to load it.

### Load unpacked

1. Unzip `LiveAudioEnhanced.zip`. You get a folder named `LiveAudioEnhanced` containing `manifest.json`.
2. Open `chrome://extensions` in Chrome (version 116 or newer).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `LiveAudioEnhanced` folder (the one with `manifest.json`).
5. Optional: pin the extension with the puzzle-piece menu so the icon is always visible.

## Use

1. Open a video or livestream on any website (YouTube, TikTok, Instagram, Facebook...) and start playback.
2. Click the Live Audio Enhanced icon while that tab is in front, then press **Start**.
3. Pick a preset or move the sliders. Changes apply immediately.
4. Press **Stop** when finished. The badge shows `ON` while capturing.

On YouTube (`youtube.com/watch?v=...`, `/live/...`, `/shorts/...` or `youtu.be/...`) Live Audio Enhanced remembers the video id: if the tab moves to a different video or to a non-video page, capture stops and you press Start again. Same id with extra parameters such as `&t=` keeps running, and so does moving from one Short to the next. On other websites, where feeds change video without a stable id, capture simply keeps running until you press Stop or close the tab.

Capture only ever starts when you press Start. Switching to another tab does not capture it. If you
open the popup on a different tab while capturing, a "Capture this tab instead" link appears.

## Controls

| Control | What it does |
|---|---|
| Start / Stop | Starts or ends capture of the current tab. Stop restores normal tab audio. |
| Audio enhancement | Off = bypass: the original audio is routed straight to the speakers while capture keeps running. |
| Preset | Natural, Balanced, Music Focus, Vocal Friendly, Concert Hall, Live Band, Acoustic, Stadium, EDM / Bass, Karaoke, Custom. Moving any control switches to Custom and remembers it. |
| My presets | Type a name and press **Save** to keep the current sliders, EQ and compressor as your own preset. Pick one from the list to load it. Edit sliders, then **Update** to overwrite it, or **Delete** (press twice to confirm). Up to 30 presets. |
| Share presets | **Export** copies all your saved presets as text (paste it in a GitHub issue, a gist or a chat). **Import** reads that text back and adds the presets, renaming duplicates. |
| Music enhancement (0-100, default 50) | Scales the EQ and compressor strength (50 = 1x, 100 = 2x, 0 = none) and the stereo effect. It is processing *intensity*, not a percentage of music recovered. |
| Stereo music focus (0-100, default 25) | Mid/Side balance (see below). |
| Vocal reduction (0-100, default 0) | Extra cut of the centred 200 Hz-4 kHz range, on top of Stereo music focus. Together they can lower that range by up to about 22 dB. Works only on stereo sources; dims centred instruments too. |
| Crowd & hall reduction (0-100, default 0) | Expander that lowers quiet, sustained sound (crowd murmur, applause tails, reverb) relative to the recent loud level, up to about 20 dB, plus up to 9 dB less high-frequency Side content. Too much can make quiet passages sound gated. |
| Bass boost (0-100, default 0) | Up to +9 dB low shelf at 110 Hz and +3 dB at 60 Hz. The level is lowered automatically to keep headroom. |
| Stereo width (0-100, default 0) | Raises the Side signal by up to about 5 dB. Bypassed for mono sources. |
| Harshness reduction | Gentle cut around 4.5 kHz plus a soft high-shelf cut. Plain filters, no noise gate or AI. |
| Master volume / Mute | 0-150 %. A safety limiter sits after it, so boosting cannot hard-clip. |
| Equalizer | 7 bands: Sub Bass 50 Hz, Bass 120 Hz, Low Mid 350 Hz, Mid 1 kHz, High Mid 3 kHz, Treble 6 kHz, High 12 kHz (+/-12 dB). Boosts automatically lower the pre-gain by half the largest boost. |
| Dynamic compressor | Threshold, ratio, attack, release, makeup gain. Defaults are gentle (3:1). |
| Live view | Real spectrum bars (original vs enhanced) in the status card, input and output meters with peak hold, and a CLIP indicator that lights when the output reaches full scale. |
| Reset to defaults | Restores the Balanced preset and all defaults. |

Settings are saved in `chrome.storage.local` and restored when you reopen Chrome.

## How it works

```
YouTube tab --tabCapture--> offscreen document (AudioContext)
  source -> stereo input -> Mid/Side -> 7-band EQ + bass + harshness -> expander -> compressor -> processed gain \
         \-> bypass gain ---------------------------------------------------------------------> master -> limiter -> speakers
  (input meter taps the source; output meter taps the limiter output)
```

- `background/service-worker.js` starts and stops capture and tracks state. It does no audio work.
- `offscreen/offscreen.js` holds the captured stream and the persistent `AudioContext`, which a
  service worker cannot do.
- `audio/` contains the engine and the DSP modules (including the crowd-reduction AudioWorklet and the spectrum analyser). `shared/settings.js` holds defaults, presets and
  validation.
- Capturing a tab mutes it locally, so Live Audio Enhanced plays the stream back itself. That is why you only
  hear one copy of the audio.

### Mid/Side processing (and its limits)

`Mid = (L + R) / 2`, `Side = (L - R) / 2`. Live Audio Enhanced lowers the Mid signal by up to about 5 dB
only between 200 Hz and 4 kHz, and raises the Side signal by up to about 4 dB. Bass, kick drums and
the top octaves are left alone, and the stereo width is preserved. At 0 % the stage is an exact
identity.

This does **not** isolate a voice. Anything panned to the centre in that range, including centred
guitars, keys or a snare, is reduced too. If the source is mono (no Side signal for about two
seconds), the stereo stage is bypassed automatically and the popup says so.

## Troubleshooting

| Problem | What to try |
|---|---|
| "Chrome has not allowed capture for this tab" | Click the Live Audio Enhanced icon while the YouTube tab is the active tab, then press Start. |
| "Browser pages cannot be captured" | Open a normal web page such as YouTube. `chrome://` pages are not allowed. |
| "Could not capture the tab audio" | Another extension or tool may already be capturing the tab. Stop it, reload the tab, try again. |
| No sound after Start | Make sure the video is playing and not muted in YouTube. Open the popup: if the input meter moves but the output does not, check Master volume and Mute. |
| Sound is too thin or too processed | Choose Natural or Vocal Friendly, or lower Music enhancement. Turn Audio enhancement off to compare with the original. |
| Voice sounds hollow | Lower Stereo music focus. Centre-panned content is reduced by that control. |
| Sound disappears after the tab closes or navigates away | Closing the tab stops capture by design. Press Start again. |
| After reloading the extension nothing plays | Reload the YouTube tab, then press Start. |
| Slight audio/video offset | Expected to be small (a few tens of ms from the output buffer). Pausing and resuming the video can resync it. |
| Popup shows ERROR | Read the message under the status badge, press Start again. If it persists, reload the extension at `chrome://extensions`. |

## Privacy

Your audio never leaves your computer: it is processed in memory and never recorded or stored. The only network request is the thumbnail image: when the popup is open on a YouTube video it loads `https://i.ytimg.com/vi/<video id>/mqdefault.jpg` from YouTube's image server, which is the same video you are already watching. Only your
slider settings are saved, locally. Permissions: `tabCapture` (capture the tab you start),
`activeTab` (read the current tab's title), host access to `youtube.com` and `youtu.be` (only to see when the video id in the address changes), `offscreen` (hold the audio engine) and `storage`
(save settings).

## Testing

What was verified while building this package:

- Manifest, all file paths, all JavaScript syntax, all module imports and every DOM id used by the
  popup were checked automatically.
- The DSP modules were run in an offline Web Audio renderer and measured: the Mid/Side stage is an
  exact identity at 0 %, reduces a centred 1 kHz tone by about 5.6 dB, leaves centred 60 Hz and
  10 kHz within 0.5 dB, boosts side-only content by about 4 dB while keeping it out of phase, the EQ
  applies the intended gain with headroom compensation, the bass boost adds about 6.7 dB at 60 Hz, the stereo width stage adds about 5 dB to side-only content, the crowd reduction lowers quiet noise by about 20 dB without touching loud music, the harshness control cuts 4.5 kHz by about
  6 dB, and the compressor narrows dynamic range and is transparent when disabled.

What needs a real browser and **has not been run here** (no Chrome with a live YouTube session was
available). Please run through this checklist after installing:

1. Normal video and livestream: audio plays once, no echo, no silence after Start.
2. Stereo and mono sources: the "Mono source detected" note appears for mono.
3. Speakers and headphones.
4. Pause and resume playback.
5. Switch to another tab: nothing else is captured; audio of the captured tab continues.
6. Close the captured tab: status returns to OFF and the badge clears.
7. Toggle Audio enhancement and Start/Stop repeatedly: no stuck silence or doubled audio.
8. Watch `chrome://memory-internals` or Task Manager (Shift+Esc) over several minutes for growth.

## Contributing

Issues and pull requests are welcome. There is no build step: edit the files and press the reload
button for Live Audio Enhanced at `chrome://extensions`. Please describe how you tested audio changes
(stereo, mono, speakers and headphones). To publish a release, push a tag such as `v1.0.0`; the
GitHub Action attaches an installable zip.

## Credits
@Khanzyoxxreal

Vibe-coded with [Claude](https://claude.ai) by Anthropic.

## License

MIT, see `LICENSE`.

## Project structure

```
LiveAudioEnhanced/
  manifest.json
  background/service-worker.js
  offscreen/offscreen.html, offscreen.js
  popup/popup.html, popup.css, popup.js
  audio/audio-engine.js, equalizer.js, stereo-processor.js, compressor.js, expander.js,
         expander-worklet.js, spectrum.js, audio-meter.js
  shared/settings.js, youtube.js
  LICENSE, CHANGELOG.md, .gitignore, .github/workflows/release.yml
  assets/icons/icon16.png, icon48.png, icon128.png
  README.md
```
