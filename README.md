# November Health 💪💑

A shared tracker for a healthy November. Each person has their own goals, both of you see each other's progress live, and you earn points toward couple rewards together.

**Screens:** Today (check in) · Together (side-by-side progress, streaks, badges) · Calendar (heatmap) · Stats (charts) · Dates (date nights, ideas, rewards) · Settings (goals, targets, rewards).

## How scoring works
- Every goal has a point value. A checkbox goal earns its points when it's checked. A number goal earns its points when the value hits the target, either "at least" (steps) or "at most" (screen time).
- A **good day** is one where you earn 80% or more of the day's possible points (you can change this in Settings). Consecutive good days build your 🔥 streak.
- Each person has a **monthly target**. The Stats chart shows your running total against the target pace.
- **Combined points** are both people's totals plus the points from date nights. They unlock the **rewards**.
- A goal you add mid-month only counts from the day you add it, so earlier days aren't penalized.

The app starts with a set of starter goals for each of you. Edit or delete them in Settings.

## 1. Set up Firebase (free, about 10 minutes)
Do this with your personal Google account.
1. Go to <https://console.firebase.google.com> → **Add project** (Google Analytics isn't needed).
2. In the project, click the **Web** icon (`</>`) to register a web app. Skip hosting.
3. Copy the `firebaseConfig` object it shows into [firebase-config.js](firebase-config.js), replacing `null`.
4. Go to **Build → Firestore Database → Create database**, pick a location near you, and choose **production mode**.
5. Open the **Rules** tab, paste this, and click **Publish**:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.time < timestamp.date(2027, 1, 1);
       }
     }
   }
   ```
   > ⚠️ There's no login, so anyone who has the URL and your config can read and edit the data. Don't put anything sensitive in it. Access shuts off automatically on Jan 1, 2027.

## 2. Put it online with GitHub Pages (free)
Use your personal GitHub account.
1. Create a new repository, for example `november-health`.
2. Upload every file in this folder: drag and drop them on the repo page, or run `git push`.
3. Go to **Settings → Pages**, set **Source: Deploy from a branch**, choose **main** and **/ (root)**, then click **Save**.
4. After about a minute the site is live at `https://<your-username>.github.io/november-health/`.
5. Open it on both phones and use **Share → Add to Home Screen** so it works like an app.

## Running it locally
ES modules don't load from `file://`, so serve the folder:
```
node dev-server.js
```
Then open <http://localhost:5173>. Until you add a Firebase config, the app runs in **demo mode**: data is saved in that browser only, though it does sync between tabs on the same device.
