# ReadDeck browser capture extension

This folder contains a working Chromium Manifest V3 extension for saving the page currently open in the browser to ReadDeck.

## Privacy model

The extension does **not** ask ReadDeck for a website username, password, cookie, or session token. Instead, you open and log in to the source site normally, then click the ReadDeck toolbar button. The extension receives temporary `activeTab` access to that one page and extracts the rendered article.

The extension separately requests access to the origin where your ReadDeck PWA is hosted so it can hand the capture to the app. It does not request permanent host access to every source website.

### Optional full archive

The extension can also use Chrome's `pageCapture` API to attach an MHTML snapshot containing the page and its resources. This is **off by default** and requests the `pageCapture` permission only when enabled in extension settings.

A full MHTML capture of an authenticated page can preserve hidden page state as well as the visible content. Keep backups private if this option is enabled. ReadDeck currently caps direct MHTML transfer at 16 MiB; larger pages still save the cleaned reader copy.

## Install for development

1. Open `chrome://extensions` in Chrome, Edge, or another compatible Chromium browser.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `extension/` folder.
4. Open the extension's **Options** page.
5. Enter the URL of your deployed ReadDeck PWA, for example `https://example.com/readdeck/`.
6. Optionally enable **Attach a full MHTML archive**.
7. Click **Save settings & permissions**.

## Use

1. Open the article or page you want to keep.
2. Log in, dismiss pop-ups, or otherwise get the page into the state you want saved.
3. Click the **ReadDeck Capture** toolbar button.
4. ReadDeck opens and imports the capture into its local IndexedDB library.

The cleaned reader copy removes scripts, forms, frames, common navigation, advertising containers, and inline event handlers. ReadDeck sanitizes the received HTML again before storing/displaying it.

## Capture payload

The extension sends a `readdeck.capture.v1` message containing:

```json
{
  "title": "Article title",
  "url": "https://example.com/article",
  "author": "Author",
  "capturedAt": "2026-08-19T12:00:00.000Z",
  "html": "<article>...</article>",
  "text": "Plain text used for search",
  "archive": {
    "format": "mhtml",
    "mimeType": "multipart/related",
    "size": 123456,
    "data": "base64..."
  }
}
```

`archive` is null when full MHTML capture is disabled. If an archive cannot be attached, it can contain a `skipped` reason while the reader copy is still saved.
