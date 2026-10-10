# Voice search

Press the microphone in the search bar, say what you want, and finish with the trigger word. "adam sandler search" searches for `adam sandler`. The trigger word is `search` unless you change it.

`!voice` opens the same thing from a command.

## Where your voice goes

It stays in the browser. The browser reads the microphone, and Whisper turns the audio into text on the visitor's device. This server never receives audio, only the finished search.

The server downloads two things, once:

- `@huggingface/transformers` and `onnxruntime-web`, from the runtime download host. That's `cdn.jsdelivr.net/npm` unless you change it. The server checks each file in Runtime checksums against its SHA-256 and refuses any that don't match.
- The Whisper model, from the model download host, at the revision you set. Hugging Face by default.

Browsers load both from this instance and never contact either host. The model and runtime end up in `data/cache/voice-search/`.

## How it listens

The plugin splits speech into phrases at each pause. When a phrase ends, Whisper transcribes it and the plugin checks whether the text so far ends with the trigger word. If it does, the plugin drops the trigger word and runs the search. A bang typed before pressing the microphone, like `!immich`, stays in front of the query.

Whisper runs in a Web Worker, so the wave keeps moving while it works. It uses WebGPU when the browser has it and WebAssembly when it doesn't.

The first time someone presses the microphone, their browser downloads the model from this server and caches it. With the default `whisper-base` that's about 77 MB on WebAssembly and about 206 MB on WebGPU. `whisper-tiny` is much smaller and less accurate.

Press the microphone again, press Stop or hit Escape to stop listening. Typing in the search bar stops it too.

## Settings

### Listening

| Setting                                 | Default        | What it does                                                                     |
| --------------------------------------- | -------------- | -------------------------------------------------------------------------------- |
| Trigger word                            | `search`       | Say it last to run the search. It can be more than one word.                     |
| Language                                | The page's     | A two-letter code such as `en` or `it`. English-only models ignore it.          |
| Seconds of silence before it stops      | 8              | 0 keeps listening until someone presses the microphone again.                    |
| Search when listening stops             | Off            | When listening stops after silence, search what it heard, trigger word or not.   |
| Show words while speaking               | On             | Transcribes the phrase while the visitor is still talking.                       |
| Milliseconds between live word updates  | 1200           | Advanced.                                                                        |
| Milliseconds of quiet that end a phrase | 700            | Advanced.                                                                        |
| Longest phrase in seconds               | 15             | Advanced. Whisper takes at most 30 seconds at a time.                            |
| Speech threshold                        | 3              | Advanced. How many times louder than background noise counts as speech.          |

### Speech model

| Setting                       | Default                       | What it does                                                                     |
| ----------------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| Speech model                  | `onnx-community/whisper-base` | Any Whisper model in transformers.js ONNX format. Find models lists them.        |
| Model revision                | A pinned commit               | Leave it blank, or change the model, to get the latest commit on `main`.         |
| Run on                        | WebGPU if available           | Advanced. Or force WebGPU or WebAssembly.                                        |
| WebGPU encoder and decoder precision | fp32 and q4            | Advanced. The model needs the matching files.                                    |
| WebAssembly encoder and decoder precision | q8 and q8         | Advanced.                                                                        |
| Model download host           | `https://huggingface.co`      | Advanced. Any host with the Hugging Face layout.                                 |

The runtime settings work the same as in the Image search plugin: download host, transformers.js version, onnxruntime-web version and checksums, all advanced.

### Appearance

Wave colours takes up to 6 CSS colours or variables. Blank uses the theme's brand colours: `--brand-blue`, `--danger`, `--brand-yellow` and `--success`.

## Browsers

The microphone needs HTTPS or `localhost`. I have only tried it in Chrome. Firefox and Safari have the APIs it uses, but nobody has tested them yet. WebGPU makes transcription much faster where the browser has it.

## Translations

The plugin ships English and Italian in `locales/`. To add a language, copy `locales/en.json` to `locales/<code>.json` and translate the values. Keep the keys and anything in curly braces, like `{pct}`, as they are.
