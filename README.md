# ReadDeck

ReadDeck is a local-first, static read-it-later PWA designed for GitHub Pages, Cloudflare Pages, or any other static host. Saved pages live in the browser's IndexedDB rather than on the host.

## Current features

- import saved HTML pages, including SingleFile exports
- one-click capture of the currently rendered/logged-in page through the bundled Chromium extension
- clean local reader view with common clutter removal
- optional full MHTML archive for higher-fidelity offline preservation
- title/site/author metadata extraction
- local full-text search
- tags
- archive/unarchive and delete
- offline app shell through a service worker
- persistent-storage request using the browser Storage API
- export the current article as standalone HTML
- download an attached MHTML archive
- print / save as PDF through the browser
- portable `.readdeck` backup and restore
- Google Drive `appDataFolder` backup and restore
- GitHub Pages deployment workflow

## Privacy model

The host serves only static application files. Article content, tags, metadata, and optional MHTML archives are stored locally in IndexedDB. Nothing is uploaded to the static host.

For authenticated/member-only pages, the browser extension captures the page you have already opened normally. The default reader capture uses temporary `activeTab` access and does not ask ReadDeck to store website credentials or cookies.

Full MHTML capture is optional and off by default. MHTML gives much better offline fidelity by packaging page resources, but a snapshot of a logged-in page can also preserve hidden authenticated page state. Keep backups private if you enable it.

Google Drive backup is opt-in and uses only the hidden application-data folder. The web app requests a short-lived OAuth access token when you press a Drive action; it does not store a Google refresh token or client secret.

## Run locally

Because service workers require HTTP(S), serve the folder rather than opening `index.html` directly. For example:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages deployment

The repository includes `.github/workflows/pages.yml`. After merging to `main`, enable GitHub Pages with **GitHub Actions** as the source in the repository settings. The workflow publishes only the static PWA files; the browser extension source is not part of the hosted site.

For a normal project Pages deployment, the app will be served under a URL such as:

```text
https://fishese.github.io/readdeck/
```

The manifest and service worker use relative paths so the project subdirectory works correctly.

GitHub Pages availability for a private repository depends on the GitHub plan. If Pages is unavailable while this repository is private, either make the repo public or deploy the same static files to another static host such as Cloudflare Pages.

## Browser capture extension

See [`extension/README.md`](extension/README.md) for setup and security details.

For a local development install:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the `extension/` directory.
4. Open the extension's options.
5. Enter your deployed ReadDeck URL and save permissions.
6. Visit a page and click **ReadDeck Capture**.

The source website receives only temporary `activeTab` access when you explicitly click the extension. The ReadDeck host origin is granted separately so the extension can deliver the capture to the PWA.

## Persistent storage

ReadDeck calls `navigator.storage.persist()` and shows the result in **Backup & restore → Device storage**. Browsers decide whether to grant persistent storage; the app cannot force the grant.

When persistence is granted, the browser should avoid evicting ReadDeck's IndexedDB/cache as part of normal automatic storage cleanup. This is still not a substitute for backups, so keep either a `.readdeck` backup or Google Drive backup if the saved pages matter.

## Backups

### Portable file

**Backup & restore** can download a `.readdeck` JSON backup containing all locally stored pages and metadata. Restore replaces the current device library after confirmation.

If full MHTML archives are attached to articles, those archives are included in the backup and can make it much larger.

### Google Drive `appDataFolder`

ReadDeck can maintain one `readdeck-backup.json` file in Google's hidden `appDataFolder`. This folder is not shown in the normal Drive UI and is accessible only through the app's OAuth scope.

To enable Drive backup for your deployment:

1. Create or choose a project in Google Cloud Console.
2. Enable the **Google Drive API**.
3. Configure the OAuth consent screen. If the app is still in testing, add the Google account(s) you plan to use as test users.
4. Create an OAuth client ID with application type **Web application**.
5. Add the ReadDeck site's **origin** to **Authorized JavaScript origins**. For example, `https://fishese.github.io/readdeck/` uses the origin `https://fishese.github.io`.
6. Configure the OAuth client ID using either the GitHub deployment workflow or the ReadDeck Settings field.
7. Use **Back up to Google Drive** or **Restore from Google Drive**.

The app requests only:

```text
https://www.googleapis.com/auth/drive.appdata
```

### Preconfigure the OAuth client ID for GitHub Pages

The client ID is an application identifier, not a secret. The Pages workflow nevertheless supports injecting it at deployment time so users do not need to paste it into the app.

Add either a repository Actions variable or secret named:

```text
GOOGLE_OAUTH_CLIENT_ID
```

The generated Pages artifact writes that value into `config.js`. Because a browser must receive the client ID to perform OAuth, the deployed value is inherently visible to site visitors even if it originated from a GitHub Secret. Never put an OAuth client **secret** in this repository or deployment.

If no deployment value is configured, the field in **Backup & restore** remains available for local/testing overrides.

Official references:

- https://developers.google.com/workspace/drive/api/guides/appdata
- https://developers.google.com/identity/oauth2/web/guides/use-token-model

## Offline behavior

The PWA shell and local library work offline after the app has been loaded once. Google authorization/Drive actions require a network connection.

The cleaned reader copy is stored locally. Images referenced only by remote URLs may not be available offline unless they are already cached by the browser. Enabling the optional MHTML archive gives a self-contained full-page archive that can be downloaded and opened from the file system.

## Security notes

Imported and extension-delivered reader HTML is sanitized before display: scripts, forms, embedded frames/objects, inline event handlers, `srcdoc`, and dangerous script URLs are removed. The extension also strips common navigation, advertising, cookie, newsletter, social-sharing, related-content, and comment containers before delivery.

The PWA validates a one-time capture nonce in the URL before accepting content handed over by the extension. The captured HTML is sanitized again on the PWA side before it is written to IndexedDB.

Treat `.readdeck` and Drive backups as private if they contain pages from authenticated services.

## License

No license has been selected yet.
