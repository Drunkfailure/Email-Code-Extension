# Email Reader – Chrome Extension

Shows verification codes from your Gmail inbox in the extension popup so you don’t have to open the inbox.

## Features

- **Gmail only** – Connects to your Gmail via Google’s OAuth and Gmail API (read-only).
- **Auto-detect codes** – Finds common patterns: 4–8 digit codes, “your code is …”, “verification code”, OTP, etc.
- **Background polling** – While you’re signed in, the extension checks your inbox **every 1 minute** for new mail and updates the list. New codes show up without opening the popup (open the popup to see the latest).
- **Instant popup** – When you open the popup, cached codes appear immediately; the list also updates live when the background finds new codes.
- **Badge** – The extension icon shows how many codes are currently cached (e.g. “3”).
- **One-click copy** – Click a code or use “Copy” to copy the latest code.
- **Refresh** – “Refresh” fetches recent messages on demand.

## Repository setup (sensitive data)

`manifest.json` is **not** committed — it contains your OAuth client ID and is listed in `.gitignore`.

1. **Copy the example manifest**:  
   `cp manifest-example.json manifest.json` (or copy `manifest-example.json` to `manifest.json` by hand).
2. **Add your credentials** in `manifest.json` when you create your OAuth client (see [Use the Client ID in the extension](#2-use-the-client-id-in-the-extension) below).

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
   - Name: e.g. “Email Reader”.
   - **Application ID** / **Item ID**: use this extension’s ID exactly: **`pbahclkpofclhckpkjgoifajlhjdjgnp`** (note: `goifajlh` not `golfajih` — copy from `chrome://extensions` to avoid typos).
   - **Create** and copy the **Client ID** (looks like `xxxxx.apps.googleusercontent.com`).

### 2. Use the Client ID in the extension

1. **Create your local manifest** (if you haven’t): copy `manifest-example.json` to `manifest.json`.
2. Load the extension once to get an ID: **Chrome** → **Extensions** → **Developer mode** → **Load unpacked** → select the `Email-Code-Extension` folder.
3. Copy the **Extension ID** (e.g. `abcdefghijklmnopqrstuvwxyz123456`).
4. In Google Cloud Console, when creating the OAuth client, paste this as the **Application ID**.
5. Open `manifest.json` and replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your full **Client ID** (e.g. `123456789-abc.apps.googleusercontent.com`).

### If you see “bad client id” or “OAuth2 not granted or revoked”

- **Application type must be “Chrome extension”** (not “Web application”). If you created a Web application client by mistake, create a new OAuth client and choose **Chrome extension**.
- **Application ID must match exactly**: `pbahclkpofclhckpkjgoifajlhjdjgnp` (no spaces, no slash). In **Credentials** → your OAuth client → **Edit** → set **Application ID** to that value and save.
- After fixing the client, remove the extension and **Load unpacked** again so Chrome picks up the correct client. If you still see “OAuth2 not granted or revoked”, go to [Google account permissions](https://myaccount.google.com/permissions), remove access for your app if listed, then try signing in again from the extension.

### If you see "Error 400: unsupported_response_type"

Use the **Web application** OAuth flow instead of the Chrome extension client:

1. **Create a Web application OAuth client** in Google Cloud Console:
   - **Credentials** → **Create credentials** → **OAuth client ID**.
   - Application type: **Web application**.
   - Under **Authorized redirect URIs**, click **Add URI** and add the exact URL shown in the extension’s **Options** page (see step 2). It will look like `https://pbahclkpofclhckpkjgoifajlhjdjgnp.chromiumapp.org/`.
   - Create and copy the **Client ID** and **Client secret**.

2. **Set the Web client in the extension**: Right‑click the extension icon → **Options** (or open `chrome://extensions`, find Email Reader, click **Details** → **Extension options**). Paste the Web application **Client ID** and **Client secret**, then click **Save**. The Options page shows the redirect URI you must add in Google Cloud.

3. **Sign in from the extension**: Open the extension popup and click **Sign in with Google**. The browser will open the normal Google sign‑in; after you allow access, the extension will receive the token and work as usual.

4. **OAuth consent screen**: If the app is in **Testing** mode, add your Google account under **OAuth consent screen** → **Test users**.

### If you see "Access blocked" or "Error 403: access_denied"

Your app is in **Testing** mode, so only approved test users can sign in. Add your account:

1. In [Google Cloud Console](https://console.cloud.google.com/) go to **APIs & Services** → **OAuth consent screen**.
2. Scroll to **Test users** and click **Add users**.
3. Enter your Google address (e.g. `Zbrech68@gmail.com`) and click **Save**.
4. Try signing in from the extension again.

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

The repo includes a default icon in `assets/icon128.png` (used for toolbar and store). To use your own icons, replace those files or add different sizes and point `manifest.json` at them (e.g. `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`).

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
