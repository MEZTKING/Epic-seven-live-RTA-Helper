# Sharing Guild War data with your guild (Firebase, free)

The Guild War page works on one device out of the box. To share it **live** with guildmates,
one person (usually the guild leader) sets up a free Firebase project once, which takes about 10 minutes.
Guildmates then just open an invite link.

## One-time setup (guild leader)

1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. **Create a project** (any name, e.g. `my-guild-e7`). Google Analytics is not needed.
3. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save.**
   Members never type an email; the app signs them in anonymously.
4. **Build → Firestore Database → Create database.** Pick a location near your guild and start in **production mode**.
5. In Firestore, open the **Rules** tab, replace everything with the contents of
   [`firestore.rules`](../firestore.rules) from this repository, and press **Publish**.
   (The same project also serves **Sync my devices** on the Home page: your own notes, matches and gear between PC and
   phone, in a private `personal/<long key>` area. If you published the rules before 2026-11-13, publish them again.)
6. **Project settings (gear icon) → General → Your apps → Web (`</>`)**. Register an app (any nickname,
   no hosting needed). Firebase shows a `const firebaseConfig = { ... }` snippet. **Copy it.**
7. Open the Epic 7 Engine **Guild War** page → **Setup**:
   - Enter your in-game name.
   - Paste the snippet into **Sharing (Firebase)** and press **Connect**.
   - Enter the guild name and press **Create guild**.
   - Press **Copy invite link** and post it in your guild chat.

## Guildmates

Open the invite link, enter your in-game name, and that's it. The link contains the guild code and the
Firebase settings, so nothing needs pasting.

## Good to know

- **Cost:** the free tier ("Spark") is far more than a guild needs.
- **Privacy:** no emails or personal details are stored, only in-game names and Guild War data.
  The Firebase web config is not a password; it only says which project to use.
- **Who can see it:** anyone with the guild code (it's in the invite link). Keep the link inside your guild.
  If it leaks, create a new guild (new code) and share a new link.
- **Backups:** Setup → Backup → Export saves everything to a file.
- **Free limits:** 50k reads and 20k writes a day. Each open page reads the guild's records once, then only changes.
