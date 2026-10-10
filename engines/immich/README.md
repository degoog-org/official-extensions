# Immich

An Images engine for your [Immich](https://immich.app) library. It uses Immich's smart search, so `dog on the beach` finds photos of a dog on a beach, not just files with "dog" in the name.

- With the engine on, your photos show up on the Images tab next to the other image engines.
- `!immich dog on the beach` searches only your Immich library.

Each result opens the photo in Immich. The degoog server fetches thumbnails with your API key and serves them from this instance, so the browser never talks to Immich.

## Search with a photo

Install the [Image search](../../plugins/image-search) plugin, drop or paste a photo into the search bar and type `!immich` next to it. Your vision model turns the photo into a text query, Immich searches your library with it, and the browser ranks the results by how much they look like the photo. If the photo is already in your library, it comes first with a "Same image" badge.

Use `!immich` for private photos. With the bang, only Immich sees the generated query. Without it, degoog sends the query to your normal web engines like any other search.

## Read only

The engine changes nothing in Immich. It makes two requests:

| Request                          | Why                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `POST /api/search/smart`         | The search. Immich wants the query in the request body, hence `POST`. It writes nothing. |
| `GET /api/assets/{id}/thumbnail` | A thumbnail for each result.                                                          |

## Creating the API key

1. In Immich, click your avatar in the top right, then **Account Settings**.
2. Open **API Keys** and click **New API Key**.
3. Name it, `degoog` for example, and tick only these permissions:

| Permission   | Used by                                               |
| ------------ | ----------------------------------------------------- |
| `asset.read` | `POST /api/search/smart`, to search your library      |
| `asset.view` | `GET /api/assets/{id}/thumbnail`, to show thumbnails |

4. Copy the key. Immich shows it once.

Immich's API spec lists these two permissions for those endpoints, checked against Immich 2.7.5. The key needs nothing else and can't change your library.

The key searches the library of the Immich user who created it.

The engine needs degoog 1.1.0 or later, which added the engine routes it serves thumbnails from. Thumbnails reach the browser through degoog's image proxy, so turn on **Allow local images** in the image proxy settings.

## Settings

| Setting           | What it does                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| Immich URL        | The address the degoog server uses to reach Immich, for example `http://192.168.1.10:2283`.        |
| API key           | The key from above. degoog stores it as a secret and never sends it to the browser.                |
| Public Immich URL | Optional. The address for "open in Immich" links, when your browser reaches Immich somewhere else. |
| Results per page  | Photos per page. 30 by default, 250 at most.                                                       |
| Thumbnail size    | Small loads faster, about 10 KB each. Preview is sharper, about 70 KB each.                        |

## Thumbnail links

Each thumbnail URL carries a signature only this server can make, so nobody can pull photos out of your library by guessing IDs. The signing key changes when the degoog server restarts, and old thumbnail links stop working.

## Translations

The engine ships English and Italian in `locales/`. To add a language, copy `locales/en.json` to `locales/<code>.json` and translate the values. Keep the keys as they are.
