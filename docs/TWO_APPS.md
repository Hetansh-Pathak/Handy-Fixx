# Two apps from one codebase

HandyFix (customers) and HandyFix Pro (providers) are built from `apps/mobile`. Only `EXPO_PUBLIC_APP_VARIANT` differs.

| | HandyFix | HandyFix Pro |
|---|---|---|
| Variant | `customer` | `provider` |
| Android package | `in.handyfix.app` | `in.handyfix.pro` |
| Deep-link scheme | `handyfix://` | `handyfixpro://` |
| Sign-up | everyone is a customer, no role question | sets up a pro (mobile number), then identity check |
| Permissions | no background location, no foreground service | background location + foreground service for presence and trips |
| Sign-in with the other kind of account | "This is a pro account. Use HandyFix Pro" | "This is a customer account. Use HandyFix" |

## Run it (from the repo root)
```bash
npm run web:customer      # browser preview of the customer app, http://localhost:8081
npm run web:provider      # browser preview of the pro app,      http://localhost:8082
npm run start:customer    # dev server for a phone/emulator with the customer development build
npm run start:provider
```
Open the preview, press F12, then Ctrl+Shift+M for a phone-size view. `apps/mobile/.env` needs the Supabase URL and key.

## Build installable apps (needs an Expo account)
```bash
cd apps/mobile
eas build --profile customer-dev --platform android   # HandyFix development build (.apk)
eas build --profile provider-dev --platform android   # HandyFix Pro development build (.apk)
# store builds: customer-production / provider-production
```

## Set up once per app
- Google Cloud: one **Android OAuth client per package** (`in.handyfix.app`, `in.handyfix.pro`) with its SHA-1; the Web client is shared (`docs/GOOGLE_SIGNIN_SETUP.md`).
- Supabase: allow redirect URLs `handyfix://**` and `handyfixpro://**` (password reset).
- Play Console: two listings. The Pro listing carries the background-location declaration; the customer app has none.
- Optional env: `EXPO_PUBLIC_PRO_APP_URL` / `EXPO_PUBLIC_CUSTOMER_APP_URL` (store links shown in the other app).
