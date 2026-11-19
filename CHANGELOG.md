# Changelog

## Unreleased
- YouTube: a Live Audio Enhanced button sits right before the Settings (gear) button in the player (watch and live pages). It opens the control panel inside the player and lights up while processing is on.
- YouTube audio is now processed directly from the page's own video element, so no tab-capture permission prompt and no need to click the toolbar icon first. Processing is bound to the video or livestream id and stops automatically when you move to a different video or leave the video page (same id with `&t=` etc. keeps running). Other sites still use tab capture from the toolbar icon.
- New compact 340px panel with a fixed size: the spectrum and level meters no longer change the layout height.

## 1.0.0
- First release: tab capture, Mid/Side stereo focus, 7-band EQ, harshness reduction,
  compressor, safety limiter, real level meters, built-in presets.
- My presets: save, load, update and delete your own named presets.
- Share presets: export all saved presets as text and import them again.
- Vocal reduction slider for a stronger cut of the centred 200 Hz-4 kHz range.
- On YouTube, capture is bound to the selected video or livestream id and stops when the tab switches to a different video. Scrolling between YouTube Shorts keeps capture running.
- Works on any website with sound (TikTok, Instagram, Facebook and more), not only YouTube.
- Live concert tools: Concert Hall, Live Band, Acoustic, Stadium, EDM / Bass and Karaoke presets,
  Crowd & hall reduction, Bass boost, Stereo width and a real-time spectrum view.
- Compact two-column interface (580px wide): video thumbnail and title at the top, live spectrum, preset dropdown,
  and Mix / Equalizer / Advanced tabs.
