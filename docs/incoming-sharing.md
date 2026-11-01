# Incoming sharing

`ShareInbox` is a zero-prop component. Mount it beneath `AppProvider`, `ThemeProvider`, `ComposerDraftProvider` and the safe-area provider. Call and await `clearIncomingShares()` from `src/sharing/platform.ts` during reset and when deleting assistant records. The inbox uses the separate `chief.mobile.incoming-shares.v1` AsyncStorage key; it never creates personal memories or library records on receipt.

The installed Expo Sharing SDK57 raw APIs are used directly. Its `useIncomingShare` convenience hook automatically resolves URLs and can fetch remote content, so this app deliberately does not call that hook or `getResolvedSharedPayloadsAsync`. Cold launch, foreground activation and the installed plugin's `chief://expo-sharing` warm-intent URL trigger capture.

Add this entry to the existing `expo.plugins` array, preserving the app's scheme, package and bundle identifier:

```json
["expo-sharing", {
  "android": {
    "enabled": true,
    "singleShareMimeTypes": ["text/plain", "text/markdown", "text/csv", "application/json", "application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"],
    "multipleShareMimeTypes": ["text/plain", "text/markdown", "text/csv", "application/json", "application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]
  },
  "ios": {
    "enabled": true,
    "appGroupId": "group.com.chief.mobile",
    "activationRule": {
      "supportsText": true,
      "supportsWebUrlWithMaxCount": 20,
      "supportsImageWithMaxCount": 20,
      "supportsFileWithMaxCount": 20,
      "supportsAttachmentsWithMaxCount": 20
    }
  }
}]
```

Rebuild the native app after configuration. Expo Go cannot register this app's native share target. The installed iOS plugin creates its extension/entitlements and targets iOS 16.4; its app group and extension must be provisioned for the signing team. Native device acceptance has not been verified from Windows.

Receipt prepares a separate review record, including local file bytes, before acknowledging the native queue. Each file is limited to 1 MiB and imported with the existing document importer/signature checks. The handle reader independently enforces this bound even if a content provider understates the size. The inbox holds at most 20 entries, 8 MiB binary data and 200,000 combined source/content characters. An over-limit batch is retained by the OS and reports an actionable error with Retry and explicit Dismiss of the unimported batch. No silent truncation or eviction occurs. Failed file reads remain visible with Retry/Dismiss and withhold native acknowledgement. Closing the review sheet retains the inbox. The latest 256 completed payload fingerprints suppress duplicate warm/cold replay, including an identical share received again during that window.

Save/Attach require a separate user press after the text/image/file-detail preview. Text and URLs are displayed as inert selectable data. Image previews use only persisted bytes. PDF previews show name/type/size and signature verification, not rendered pages. A shared URL is saved without opening it. Attachment uses a stable library identity and merges current composer selections; it refuses an overflow instead of dropping existing attachments. Existing draft text is never rewritten, and attachment does not send a prompt. Repeating an action after an interrupted acknowledgement reuses the existing library item.

SDK57's Android parser labels text/* file streams as `text`; content:// values are imported as actual files. Its single text/plain SEND branch reads only EXTRA_TEXT, so an originating app that shares a .txt solely through EXTRA_STREAM may produce no payload. Share the selected text, use a supported document MIME, share multiple files, or use the existing file picker in that case. A full native share sheet test is still needed on real Android/iOS devices.

The browser adapter accepts explicit GET parameters `share_text`, `share_title`, `share_url`, persists them, then removes those parameters with `history.replaceState`. A host that provides an installed PWA manifest can use this text-only target:

```json
{"share_target":{"action":"/","method":"GET","enctype":"application/x-www-form-urlencoded","params":{"title":"share_title","text":"share_text","url":"share_url"}}}
```

This is a GET text/URL adapter; no browser file POST receiver or service worker is installed. Plain `?text=`/`?url=` query parameters are ignored. Native file shares use the local Expo File adapter and cannot fetch HTTP resources. Preview, saving and draft attachment are all available without a provider connection.

Boundary tests: `rtk proxy node --test test/incoming-share.test.mjs`. They cover durable cold/warm/reload deduplication, storage failure, import retry/dismiss, URL safety, capacity, concurrent captures, native intent replacement races, composer attachment limits, corrupt storage, Android text streams and bounded file reads.
