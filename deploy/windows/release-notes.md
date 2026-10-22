Download the Windows x64 **setup.exe**, run it, then open **ununemploy** from the Start menu. No ZIP, Node installation, terminal command or folder copying is needed. Windows 11 x64 is required. Setup installs Microsoft's WebView2 runtime automatically if it is missing; that step needs an internet connection.

This beta includes a smaller compiled application, PDF exports using the shared Windows WebView2 runtime, offline LaTeX support, and improvements to resume onboarding and assistant response recovery. PDF reading runs in a separate process to contain native parser failures.

For an update, use **File → Quit ununemploy**, then run the new setup. Personal records and settings remain outside the installation directory. Uninstalling also preserves them.

The beta is unsigned: Windows may show a publisher/reputation prompt. Completed ChatGPT sign-in and live resume interpretation on a separate clean Windows machine still require verification. Automated tests cover synthetic documents and sign-in start/cancel, not live subscription availability or interpretation quality.

The SHA-256 file and `windows-release.json` identify the installer, source revision, download size and unpacked size. Report the version shown in **Settings → General** when reporting an issue.
