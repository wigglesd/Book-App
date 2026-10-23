# Hosting Book App on your Windows PC

This sets Book App up to run in the background on your PC, start
automatically with Windows, and be reachable from anywhere at a free,
permanent HTTPS address from [Tailscale Funnel](https://tailscale.com/kb/1223/funnel)
(something like `https://my-pc.tail1234.ts.net`). HTTPS matters: phones only
allow barcode scanning with the camera on HTTPS sites.

You only do this once. It takes about 15 minutes.

## What you need

- A Windows 10 or 11 PC that stays switched on (people can only reach your
  lists while it's awake).
- An administrator account on that PC.
- A free Tailscale account. You can create it during setup with your Google,
  Microsoft or GitHub login.

## 1. Open an administrator PowerShell

Click Start, type **PowerShell**, right-click **Windows PowerShell** and choose
**Run as administrator**. Use this window for all the steps below.

## 2. Install Git and download the app

```powershell
winget install --id Git.Git --exact
```

Close the PowerShell window and open a new administrator one (so it finds
Git), then:

```powershell
git clone https://github.com/wigglesd/Book-App C:\BookApp
cd C:\BookApp
```

If the repository is private, a GitHub sign-in window appears; sign in with
your GitHub account.

## 3. Run the setup script

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1
```

The script walks you through everything and asks before installing
anything:

1. **Node.js:** installs it if it's missing.
2. **Your name and owner password:** the name appears on the public page
   ("Has David read it?"). The password must be at least 12 characters,
   because the login page is on the internet.
3. **Background task:** registers a **Book App** task that starts the app
   whenever Windows starts, even before anyone logs in, and restarts it if
   it ever stops.
4. **Sleep:** offers to stop the PC sleeping while it's plugged in.
5. **Tailscale:** installs it and opens a browser to sign in. Then it turns
   on Funnel. **The first time, Tailscale prints a link to approve Funnel
   for your account.** Open it, click approve, and the script carries on.

When it finishes it prints your two addresses:

- `https://<your-pc>.<tailnet>.ts.net/`: your page. Log in here to add books.
- `https://<your-pc>.<tailnet>.ts.net/share.html`: the link to share with
  other people.

The address can take a minute or two to start working the first time.

## 4. Try it

On your phone, open your page, log in, tap **Scan barcode** and point the
camera at the barcode on the back of a book. Add it to your read list, then
open the share link to check it shows up.

Tip: add both pages to your phone's home screen (Share > Add to Home Screen
on iPhone, or the browser menu on Android) so they open like an app.

## Everyday things

| To... | Do this |
| --- | --- |
| **Back up your books** | Copy `C:\BookApp\data\books.json` somewhere safe. A dated copy is also saved in `C:\BookApp\data\backups` each time the app starts (the last 30 are kept). |
| **Update the app** | In an administrator PowerShell: `cd C:\BookApp`, `git pull`, then run the setup script again. It keeps your settings and books. |
| **Change your password** | In an administrator PowerShell: `Remove-Item C:\BookApp\.env`, then run the setup script again. |
| **See what's wrong** | Logs are in `C:\BookApp\data\server.log` and `server-error.log`. |
| **Restart the app** | `Stop-ScheduledTask "Book App"; Start-ScheduledTask "Book App"`, or just restart the PC. |
| **Remove it** | `powershell -ExecutionPolicy Bypass -File scripts\windows\uninstall.ps1`. Your books file is kept. |

## Good to know

- **Who can see what.** Anyone with your address can see your read list
  and wishlist and check books against them. Only someone with your owner
  password can change them. After 10 wrong passwords in 15 minutes, logins
  pause for 15 minutes.
- **Your password file.** `.env` holds your password and is readable only by
  administrators, so opening it needs an administrator editor.
- **Optional: Google Books key.** If many lookups come back "not found", the
  free Google Books fallback may have hit its daily limit. Get a free key
  from the [Google Cloud console](https://console.cloud.google.com/apis/library/books.googleapis.com)
  and add a line `GOOGLE_BOOKS_API_KEY=your-key` to `.env`, then restart the
  app.
- **If the PC is off**, the address stops working until it's back on. Your
  data is safe.
