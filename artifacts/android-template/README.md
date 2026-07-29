# Awajimaa Android App Template

Minimal Kotlin WebView wrapper. The GitHub Actions workflow in `.github/workflows/build-apk.yml` builds, signs, and uploads the APK automatically when triggered by the Awa Biz Suite backend.

## First-time setup

### 1 — Push this repo to GitHub

```bash
git init
git remote add origin https://github.com/<YOUR_ORG>/awajimaa-android-template
git add .
git commit -m "initial template"
git push -u origin main
```

### 2 — Generate a keystore (once)

```bash
keytool -genkeypair -v \
  -keystore awajimaa-release.jks \
  -alias awajimaa-release \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

Base64-encode it for the GitHub secret:

```bash
base64 -i awajimaa-release.jks | tr -d '\n'
```

### 3 — Add GitHub Actions secrets

In **Settings → Secrets and variables → Actions** for this repo:

| Secret name         | Value                                     |
|---------------------|-------------------------------------------|
| `KEYSTORE_BASE64`   | base64 output from step 2                |
| `KEYSTORE_PASSWORD` | password you chose in keytool             |
| `KEY_ALIAS`         | `awajimaa-release` (or whatever you set)  |
| `KEY_PASSWORD`      | key password (often same as store password)|

### 4 — Add environment secrets to Awa Biz Suite

In the Awa Biz Suite Replit secrets:

| Secret name                   | Value                                                   |
|-------------------------------|---------------------------------------------------------|
| `GITHUB_ACTIONS_TOKEN`        | GitHub PAT with `repo` + `workflow` scopes              |
| `GITHUB_ANDROID_REPO_OWNER`   | GitHub username or org that owns this repo              |
| `GITHUB_ANDROID_REPO_NAME`    | Repo name e.g. `awajimaa-android-template`              |
| `MOBILE_APP_CALLBACK_SECRET`  | Any random secret string (e.g. `openssl rand -hex 32`) |

### 5 — Add the Gradle wrapper JAR

The `gradlew` script needs `gradle/wrapper/gradle-wrapper.jar`. Generate it once locally:

```bash
gradle wrapper --gradle-version 8.6
```

Then commit `gradle/wrapper/gradle-wrapper.jar` to the repo.

## How it works

1. A vendor submits their website URL in Awa Biz Suite.
2. The API server triggers this workflow via `workflow_dispatch` with their details.
3. GitHub Actions customises the template (package name, app name, URL, icon).
4. Gradle builds a signed release APK using your keystore.
5. The APK is POSTed back to the Awa Biz Suite API, which stores it and marks the build complete.
6. The APK is automatically published to the Awajimaa App Store.
