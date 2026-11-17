'use strict';

const { appendFileSync } = require('node:fs');
const path = require('node:path');

function createLoginLog({ file = path.resolve('tuiline-login.log'), now = () => new Date() } = {}) {
  const entries = [];
  let previous = '';
  let writeError = '';
  let printed = false;
  return {
    record(view) {
      const login = view.login;
      if (!login?.stage || login.stage === 'idle') return;
      // Log application-generated progress only, never the full backend state.
      // PIN, QR image, login attempt IDs, account data and messages are excluded.
      const text = String([login.statusText, view.authDiagnostic].filter(Boolean).join(' · '))
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
        .slice(0, 1000);
      const key = JSON.stringify([login.stage, text, view.status]);
      if (key === previous) return;
      previous = key;
      const line = `${now().toISOString()} [login:${login.stage}] ${text} (backend: ${view.status || 'unknown'})`;
      entries.push(line);
      if (entries.length > 100) entries.shift();
      try {
        appendFileSync(file, `${line}\n`, { mode: 0o600 });
      } catch (error) {
        writeError = error.code || 'write failed';
      }
    },
    print(stream = process.stderr) {
      if (printed || !entries.length) return;
      printed = true;
      stream.write(`\nLINE login diagnostics:\n${entries.join('\n')}\n`);
      stream.write(writeError ? `Could not write login log: ${writeError}\n` : `Login log: ${file}\n`);
    },
  };
}

module.exports = { createLoginLog };
