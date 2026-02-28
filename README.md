# Email Code Reader – Chrome Extension

Shows verification codes from your Gmail inbox in the extension popup so you don’t have to open the email.

## Features

- **Gmail only** – Connects to your Gmail via Google’s OAuth and Gmail API (read-only).
- **Auto-detect codes** – Finds common patterns: 4–8 digit codes, “your code is …”, “verification code”, OTP, etc.
- **Background polling** – While you’re signed in, the extension checks your inbox **every 1 minute** for new mail and updates the list. New codes show up without opening the popup (open the popup to see the latest).
- **Instant popup** – When you open the popup, cached codes appear immediately; the list also updates live when the background finds new codes.
- **Badge** – The extension icon shows how many codes are currently cached (e.g. “3”).
- **One-click copy** – Click a code or use “Copy” to copy the latest code.
- **Refresh** – “Refresh” fetches recent messages on demand.

## Setup (required)

The extension needs a **Google OAuth 2.0 Client ID** (Chrome app type) so it can ask for permission to read your Gmail.

### 1. Create a project and OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or pick an existing one).
3. Enable the **Gmail API**:
   - **APIs & Services** → **Library** → search “Gmail API” → **Enable**.
4. Create OAuth consent (if you haven’t):
   - **APIs & Services** → **OAuth consent screen** → **External** (or Internal for workspace) → fill app name, support email, developer contact → **Save**.
5. Create credentials:
   - **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
   - Application type: **Chrome extension**.
   - Name: e.g. “Email Code Reader”.
   - **Application ID**: you get this from your extension’s “Extension ID” in `chrome://extensions` (load the unpacked extension first, then copy the ID).
   - **Create** and copy the **Client ID** (looks like `xxxxx.apps.googleusercontent.com`).

### 2. Use the Client ID in the extension

1. Load the extension once to get an ID: **Chrome** → **Extensions** → **Developer mode** → **Load unpacked** → select the `Email-Code-Extension` folder.
2. Copy the **Extension ID** (e.g. `abcdefghijklmnopqrstuvwxyz123456`).
3. In Google Cloud Console, when creating the OAuth client, paste this as the **Application ID**.
4. Open `manifest.json` and replace:
   - `YOUR_CLIENT_ID` with your full Client ID (e.g. `123456789-abc.apps.googleusercontent.com`).

So the `oauth2` section looks like:

```json
"oauth2": {
  "client_id": "123456789-xxxx.apps.googleusercontent.com",
  "scopes": [
    "https://www.googleapis.com/auth/gmail.readonly"
  ]
}
```

5. Reload the extension in `chrome://extensions`.

### 3. Install and use

- **Extensions** → **Load unpacked** → select the `Email-Code-Extension` folder.
- Click the extension icon → **Sign in with Google** (allow Gmail read-only when asked).
- Codes from recent/unread emails appear in the popup; click a code or **Copy** to copy.

## Optional: custom icons

To add your own icons, create an `icons` folder and add:

- `icons/icon16.png` (16×16)
- `icons/icon32.png` (32×32)
- `icons/icon48.png` (48×48)

Then in `manifest.json` add back under `"action"` and at the root:

```json
"action": {
  "default_popup": "popup.html",
  "default_icon": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png"
  },
  "default_title": "Email Code Reader"
},
"icons": {
  "16": "icons/icon16.png",
  "32": "icons/icon32.png",
  "48": "icons/icon48.png"
}
```

## Privacy and security

- Only the **Gmail read-only** scope is used; the extension cannot send or delete email.
- OAuth and API requests go to Google; no code or email content is sent to any other server.
- Codes are parsed locally and shown only in your browser.

## Phone / SMS

This version is **email-only**. Adding phone/SMS would require either:

- A separate service (e.g. Twilio, or an Android app) that can read SMS and expose codes via an API, or
- A native Android companion app with SMS permission and a way to talk to the extension (e.g. custom protocol or cloud sync).

If you want to explore an SMS path later, we can design it (e.g. “SMS Code Reader” that uses a small backend or app).

## License

MIT.
