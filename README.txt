MEMEINATER 6700 - Phase 1 (accounts, your own sounds, groups, send sounds, everyone group)

A. BACKEND (Supabase), about 5 minutes
 1. Open setup.sql in Notepad. On the LAST line change MEMEGANG to your own secret gang code.
 2. Supabase dashboard > SQL Editor > New query > paste all of setup.sql > Run. (Safe to run again.)
 3. Supabase > Authentication > Sign In / Providers > Email: turn OFF "Confirm email". Save.
 4. Open www\config.js and paste your Project URL (Project Settings > API).

B. TRY IT FAST IN A BROWSER
 Drag the www folder onto app.netlify.com/drop, open the link on your phone.

C. MAKE THE APK
 NO ANDROID STUDIO? Use GitHub (free, builds in the cloud): upload this folder to GitHub and run the Build APK and EXE workflow (builds the APK and the Windows .exe in the cloud), or
 use the Netlify link and Chrome menu > Install app.
 With Android Studio: needs Node.js 22+. Double-click BUILD.bat, then in Android Studio:
 Build > Build Bundle(s) / APK(s) > Build APK(s).
 APK: android\app\build\outputs\apk\debug\app-debug.apk
 After that you can use BUILD_APK.bat to rebuild.

E. WINDOWS: see the windows folder, README.txt in there.

D. USING IT
 First person: JOIN THE GANG with your gang code. Send friends the APK + the gang code.
 BOARD = your sounds (tap play, hold for send/add to group/delete). + SOUND uploads a file (max 3 MB).
 GROUPS = EVERYONE group + your own groups (share a group's code so friends can JOIN WITH CODE).
 INBOX = sounds friends sent you: ADD puts it on your board.
 Not in this phase yet: chat, calls with the board on top, reels.
