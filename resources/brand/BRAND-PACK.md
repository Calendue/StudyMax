# StudyMax mobile + website assets

Use this pack for the approved **Paper hop A2 symbol** and **06 Notebook signature wordmark (Caveat Bold 700)**.

## Which files do I use?

| Placement | File or folder |
| --- | --- |
| Website header, light background | `website/public/brand/studymax-wordmark-berry.svg` |
| Website header, neutral dark lettering | `website/public/brand/studymax-wordmark-ink.svg` |
| Website header, dark background | `website/public/brand/studymax-wordmark-cream.svg` |
| Standalone website symbol | `website/public/brand/studymax-symbol-berry.svg` |
| Browser tab icon | `website/public/favicon.ico` and `favicon.svg` |
| iPhone website Home Screen icon | `website/public/apple-touch-icon.png` |
| Installable web app icons | `website/public/brand/icon-*.png` and `website/public/site.webmanifest` |
| Link previews / social sharing | `website/public/brand/social-share-1200x630.png` |
| Expo / React Native app | `mobile/expo/` |
| Native Xcode app | `mobile/native-ios/Assets.xcassets/AppIcon.appiconset/` |
| Native Android app | `mobile/native-android/res/` |
| Mobile header / in-app branding | `mobile/shared/wordmark-*.png` with matching `@2x` and `@3x` files |
| Editable design masters | `design-source/` |

## Website setup

1. Merge the contents of `website/public/` into your site's public/static directory. For Vite, Next.js, and most React projects this is `public/`.
2. Merge `website/head-snippet.html` into your existing HTML head, or configure the equivalent framework metadata. If you already have a favicon or web manifest, update the existing references instead of adding competing definitions.
3. Use `website/header-example.html` as the logo-image pattern. SVG is the preferred website format; transparent PNG alternatives are also included.
4. Set your Open Graph and Twitter image fields to the **absolute HTTPS URL on your domain** for `/brand/social-share-1200x630.png`.

The included web manifest assumes the app is served from `/`. If your app lives under a subpath, update its `id`, `scope`, `start_url`, and icon paths, plus the head snippet's paths. If your site already has a manifest with a stable app ID, preserve that ID and merge the new icons into it. Adding a manifest and icons alone does not implement offline support or guarantee installability.

All logos are single-colour assets. Choose berry or ink on light backgrounds, and cream on dark backgrounds. Display the wordmark on its own; the symbol is intended for app icons or independent placements.

## Expo / React Native setup

1. Copy `mobile/expo/assets/brand/` to `assets/brand/` in your app.
2. **Merge** the fields from `mobile/expo/app-config.fragment.json` into your existing Expo configuration. The fragment is not a complete app config and must not replace your app name, slug, IDs, plugins, or other settings.
3. `Wordmark.example.tsx` shows the PNG-based header logo. Place it under `components/`. React Native can select the corresponding `@2x` and `@3x` files automatically.
4. The app icon changes require a native rebuild. Apply them through your normal native generation/build workflow. For manually maintained native projects, use the native asset folders rather than relying only on Expo config.

The iOS appearance object is intended for Expo versions supporting `ios.icon.light`, `dark`, and `tinted`. For an older SDK, use the single `./assets/brand/icon.png` path as `ios.icon`, or import the supplied Xcode catalog directly.

The optional white-on-transparent `notification-icon.png` can be used with your Android notification configuration if needed. It is not a launcher icon, and the fragment does not enable notifications or add plugins.

## Native iOS setup

Merge the supplied `AppIcon.appiconset` into your Xcode asset catalog and select **AppIcon** in the app target. The default, dark, and tinted images are opaque 1024 × 1024 squares. Do not add rounded corners to them; iOS applies the mask. Common smaller PNGs and optional Icon Composer input layers are also included.

The supplied asset catalog was compiled with Xcode `actool` for iPhone and iPad. The Icon Composer input layers are source images, not a finished `.icon` document.

## Native Android setup

Merge `mobile/native-android/res/` into `app/src/main/res/` and add these attributes to your existing application element:

```xml
android:icon="@mipmap/studymax_launcher"
android:roundIcon="@mipmap/studymax_launcher_round"
```

The resource folders include adaptive icons, themed monochrome artwork, and legacy launcher sizes. They passed Android SDK `aapt2 compile`. Keep the full transparent canvas of the adaptive foreground so launcher masks do not clip it.

## Formats and editing

- **SVG:** scalable symbols and outlined wordmarks; no font installation needed to display them.
- **PNG:** transparent logos for native apps and tools that do not support SVG.
- **ICO:** browser favicon containing 16, 32, and 48 px images.
- **TTF:** original Caveat variable font, included with its SIL Open Font License. Select weight 700 for matching live text.
- **JSON/XML:** web manifest, Expo fragment, and native icon configuration.

All native icon assets and the approved source wordmarks were preserved from the selected branding bundle. This pack adds website exports, mobile density variants, and integration examples. No live app, website, or deployment was modified.

## Official integration references

- [Expo app configuration](https://docs.expo.dev/versions/latest/config/app/)
- [Apple app icon asset catalogs](https://developer.apple.com/documentation/xcode/configuring-your-app-icon)
- [Android adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)
- [Web manifest icons](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons)
- [Maskable icon safe area](https://web.dev/articles/maskable-icon)
