# Yandex Visual Search

A reverse image search engine for the Images tab. Drop, paste or pick an image in the search bar and Yandex finds the pages that use it, then images that look like it.

## Where the image goes

**This engine sends the visitor's image to Yandex.** Every image searched with the engine on is uploaded to Yandex, a third party, together with any words typed next to it. Yandex sees this server's IP address, not the visitor's, and keeps the image under its own terms. degoog itself doesn't store the image.

## How it searches

Each image search makes two requests, both through the engine's outgoing transport:

| Request                        | Why                                                   |
| ------------------------------ | ----------------------------------------------------- |
| `POST /images/search` (upload) | Sends the image. Yandex answers with an id for it.    |
| `GET /images/search?cbir_id=`  | The results for that id, with the typed words if any. |

Yandex returns every result on the first page, so later pages send nothing. Repeating a search inside degoog's cache window sends nothing either.

Words typed next to the image go to Yandex as a refinement, so a photo of a dog plus `puppy` narrows the results.

## Settings

| Setting       | Default                  | What it does                                                                       |
| ------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| Yandex domain | `yandex.com`             | Which Yandex to ask. Results and captchas can differ between domains.              |
| Results       | Pages and similar images | Pages that contain the image, images that look like it, or both. Pages come first. |

## Captchas

Yandex sometimes answers a busy server with a captcha. The engine reports it as blocked rather than returning an empty list, so degoog doesn't cache an empty answer for the rest of the day. A different outgoing transport, such as curl-impersonate, or a proxy usually helps.
