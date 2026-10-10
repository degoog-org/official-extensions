# Image search

Makes degoog's image search better. degoog itself takes the image: drop, paste or pick one in the search bar, type a few words next to it if you like, and press Enter. This plugin adds two things, and each can be turned off on its own:

- **Turn images into a search query.** Your vision model writes one short query for the image, and degoog runs it through your normal image engines, next to any engines that search by image.
- **Re-rank results by how they look.** The visitor's browser compares every result with the image using a CLIP model and reorders them.

## How it works

degoog sends the image from the browser to this server with the search. The server hands it to your vision model, which writes a search query. The server keeps no copy of the image. Text engines only ever see that query, so your POST search, language, image filters, cache and indexer settings all apply as usual. The browser remembers the query, so later pages, retries and reloads don't ask the model again.

Once results arrive, the visitor's browser compares each one with the image. Results that don't look like it move to the end. You can hide them instead, or leave degoog's order alone. Copies of the picture, resized or recompressed, get a "Same image" badge from a perceptual fingerprint of each thumbnail. Crops don't get the badge, but CLIP still ranks them near the top. Results that load as you scroll get ranked too.

degoog only shows the image button when an enabled engine can use the image, so with the query turned off you need at least one engine that searches by image.

## Where your data goes

| Data                      | Path                                                                   | Kept                                                         |
| ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| The image                 | browser, then this server, then the vision model URL in settings       | In the visitor's tab, in `sessionStorage`, until it closes   |
| The generated query       | this server, then your image engines, then back to the browser         | Like any other search                                        |
| Result thumbnails         | engines, then degoog's image proxy, then the browser                   | Like any other search                                        |
| Ranking model and runtime | this server downloads them once, browsers load them from this instance | In `data/cache/image-search/`                                |

If the vision model URL points at a hosted provider, that provider gets the image. Engines that search by image send it to their own site, and each one says so in its settings.

The server downloads two things, once, and only while ranking is on:

- `@huggingface/transformers` and `onnxruntime-web`, from the runtime download host. That's `cdn.jsdelivr.net/npm` unless you change it. The server checks each file in Runtime checksums against its SHA-256 and refuses any that don't match.
- The ranking model, from the model download host, at the revision you set. Hugging Face by default.

Browsers never contact either host. Every time you save settings, the server logs the model, revision and runtime versions it picked.

## Settings

Every setting has a default, and most people only change the vision model URL and model. Advanced settings stay hidden until you show them.

| Setting                          | Default | What it does                                                       |
| -------------------------------- | ------- | ------------------------------------------------------------------ |
| Turn images into a search query  | On      | Off hides the vision model settings and skips the model entirely.  |
| Re-rank results by how they look | On      | Off hides the ranking settings and nothing is downloaded for it.   |

### Vision model

This is the model that turns the picture into a query.

| Setting                            | Default                  | What it does                                                                                  |
| ---------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| Vision model URL                   | `http://localhost:11434` | Ollama, llama.cpp, LM Studio, vLLM or any OpenAI-compatible server.                           |
| Provider                           | Detect automatically     | Leave it on detect, or pick one.                                                              |
| Model                              | `qwen3.5:4b`             | Any model that takes images. Fetch models lists what the server has.                          |
| API key                            | None                     | Only if your server wants one.                                                                |
| Prompt                             | Built in                 | Advanced. Goes out with every picture. Keep the sentence asking for a JSON `query` field.     |
| Prompt when the visitor adds words | Built in                 | Advanced. Added when someone types words next to the picture. `{text}` becomes those words.   |
| Timeout in seconds                 | 60                       | Advanced.                                                                                     |
| Largest image accepted, in MB      | 6                        | Advanced.                                                                                     |
| Images described at once           | 2                        | Advanced. Past this, new image searches skip the query and say the model is busy.            |

### Ranking

Ranking runs in the visitor's browser.

| Setting                                | Default                                  | What it does                                                                                    |
| -------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Ranking model                          | `Xenova/clip-vit-base-patch32`           | Any CLIP model in transformers.js ONNX format. Find models searches the model download host.    |
| Ranking model revision                 | A pinned commit of the default model     | A branch, tag or commit. Leave it blank, or change the model, to get the latest commit on `main`. |
| Results that don't look like the image | Move to the end                          | Move them to the end, hide them or leave them where they are.                                   |
| Match threshold, in percent            | 75                                       | Below this similarity a result counts as not matching.                                          |
| Same image threshold, in percent       | 90                                       | Advanced. How close a result's fingerprint has to be to your image to get the "Same image" badge. |
| Weight of typed words                  | 2                                        | Advanced. How much the typed words count when ordering. 0 ignores them.                         |
| Run on                                 | WebGPU if available, otherwise WebAssembly | Advanced. Or force one.                                                                       |
| WebGPU precision                       | fp16                                     | Advanced. The model needs the matching file, such as `onnx/vision_model_fp16.onnx`. GPUs without fp16 support use fp32 on WebGPU instead. |
| WebAssembly precision                  | q8                                       | Advanced. For example `onnx/vision_model_quantized.onnx`.                                       |
| Images ranked per batch                | 8                                        | Advanced.                                                                                       |
| Thumbnails fetched at once             | 12                                       | Advanced.                                                                                       |
| Ranking model download host            | `https://huggingface.co`                 | Advanced. Any host with the Hugging Face layout, a mirror for example.                          |

### Ranking runtime

All advanced.

| Setting                 | Default                        | What it does                                                         |
| ----------------------- | ------------------------------ | -------------------------------------------------------------------- |
| Runtime download host   | `https://cdn.jsdelivr.net/npm` | Any npm CDN that serves `package@version/path`, `unpkg.com` too.     |
| transformers.js version | `4.3.0`                        |                                                                      |
| onnxruntime-web version | Blank                          | Blank means the version transformers.js depends on.                  |
| Runtime checksums       | SHA-256 of the default files   | One `file sha256` per line. Update or clear them when versions change. |

The ranking model uses WebGPU when the browser has it and WebAssembly when it doesn't. The first search downloads the model from this server, about 170 MB for the default one, and the browser caches it after that. The results page starts loading the model as soon as it opens, while the search is still running, and shows each step until ranking starts.

## Translations

The plugin ships English and Italian in `locales/`. To add a language, copy `locales/en.json` to `locales/<code>.json` and translate the values. Keep the keys and anything in curly braces, like `{count}`, as they are.
