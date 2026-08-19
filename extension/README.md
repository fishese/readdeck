# ReadDeck browser capture extension

This folder defines the next capture layer. The static PWA intentionally does not receive website cookies, passwords, or session tokens.

## Intended flow

1. User opens a page normally and signs in if necessary.
2. A Manifest V3 browser extension runs a content script in the active tab.
3. The content script clones the rendered DOM, removes scripts/forms and common page chrome, and captures metadata such as title and canonical URL.
4. The extension sends the capture to ReadDeck through an explicit user action.
5. ReadDeck stores the resulting article locally in IndexedDB.

## Payload contract

```json
{
  "type": "readdeck.capture.v1",
  "title": "Article title",
  "url": "https://example.com/article",
  "author": "Author",
  "capturedAt": "2026-08-19T12:00:00.000Z",
  "html": "<article>...</article>",
  "text": "Plain text used for search"
}
```

The first MVP uses HTML/SingleFile import while the direct extension transport is implemented and reviewed separately.
