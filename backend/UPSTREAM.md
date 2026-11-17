# Bundled LINE backend

Copied from the `backend/` directory of the local `line` checkout at commit
`becb4c9fc85c0c808b4c46804482d0dc22258bcc` on 2026-11-17.
The Go module identifies its upstream as
<https://github.com/kongesque/line-cli>.

The complete Go source, tests, module checksums, and embedded data are included.
Building and running tuiline does not require the original checkout.

`LICENSE` preserves the backend's MIT license and copyright notices.
`LICENSE.omarchy-line` preserves the enclosing LINE for Omarchy project's
MIT license and copyright notice.

`scripts/build-line.js` applies tuiline's patches through a temporary Go overlay,
including the additional Go files in `line-tui/backend/`. The bundled source
itself remains the imported snapshot.

Build from the repository root with `npm run build:line`.
Run backend regression tests with `node scripts/build-line.js --test`.
