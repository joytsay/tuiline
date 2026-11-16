# tuiline — LINE in your terminal

Original repo from [tuigram](https://github.com/leonid-shutov/tuigram)

An OpenTUI client for LINE Messenger using the Go backend from
`/home/joy/Git/line`. The interface stays in the terminal: chats on the left,
conversation history on the right, and a keyboard-operated composer.

## Run

Requires Node.js 26.4+, the reference LINE checkout, and its Go toolchain:

```sh
npm ci
npm run build:line
npm run dev
```

The local build raises the reference backend's 500-chat limit to 5,000.
If no local binary has been built, the client falls back to
`../line/build/plugin/bin/line-gui`, which retains the reference limits.

Override the checkout with `LINE_SOURCE=/path/to/line`, or run an existing
binary with `LINE_BACKEND=/path/to/line-gui npm run dev` or
`npm run dev -- --backend /path/to/line-gui`.

Try fictional chats without signing in or contacting LINE:

```sh
npm run dev -- --demo
```

## Keys

| Key                      | Action                                                          |
| ------------------------ | --------------------------------------------------------------- |
| Up/Down, j/k             | Select a sidebar chat or move the message cursor in scroll mode |
| h / l                    | Leave / enter conversation focus (outside insert mode)          |
| Tab                      | Switch sidebar / conversation scroll mode                       |
| Enter from sidebar       | Focus conversation in scroll mode                               |
| i                        | Enter insert mode                                               |
| l on an image or sticker | Expand to fill the right pane; h or Escape returns              |
| Enter in insert mode     | Send text                                                       |
| Escape                   | Return to scroll mode, preserving your draft                    |
| Ctrl+F / Ctrl+B          | Move a full page down / up in scroll mode                       |
| Ctrl+D / Ctrl+U          | Move half a page down / up in scroll mode                       |
| gg / G                   | Jump to the top / bottom of the focused list                    |
| PageUp/PageDown          | Scroll loaded history                                           |
| g then x                 | Open links in the marked message; pick a link if several        |
| Ctrl+R                   | Refresh                                                         |
| Ctrl+L                   | Start or retry QR login                                         |
| Ctrl+Y                   | Confirm login when requested                                    |
| Ctrl+X                   | Cancel login                                                    |
| Ctrl+C                   | Quit                                                            |

Scan the QR code in the terminal using LINE on your phone, then follow the
PIN/confirmation prompts. Authentication and encryption remain managed by the
reference backend, including its Secret Service requirements. This client uses
the same saved account as that backend. Avoid simultaneous clients using the
same session if the backend reports it is locked.

This version supports listing chats, loading the latest history, text sending,
live incoming updates, and terminal image rendering. In scroll mode, the `›`
marker identifies the selected message; `gx` opens links from that message.
Selecting an image message loads its inline PNG/JPEG preview (up to 2 MiB and
4096×4096). Sticker images supplied by the backend render inline automatically.
OpenTUI chooses the terminal's image protocol, with Unicode blocks as a fallback.
Failed or unsupported images retain their text placeholder. Previews are held
in memory with a bounded cache and cleared when switching conversations.

Outgoing messages show `✓` after sending and `✓✓` when a live read receipt is
observed. In groups, this means at least one other member has read the message.
Receipts are session-local; older reads are not inferred from history. The TUI
does not automatically mark incoming messages as read.

Attachment sending, sticker selection, reactions, and message actions have no
TUI controls yet. History is limited to 100 messages per chat. The local build
supports 5,000 chats; the reference binary caps at 500. Drafts live in memory.
Uncertain sends are shown and blocked from
automatic resending; check LINE and refresh before deliberately trying again.
Desktop notifications are disabled by this frontend.

The original Telegram implementation is available with `npm run dev:telegram`;
its original documentation is in [docs/TELEGRAM.md](docs/TELEGRAM.md). Existing
Telegram configuration is separate from the LINE backend's session.
