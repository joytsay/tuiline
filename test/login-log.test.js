'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLoginLog } = require('../line-tui/login-log');

test('login progress is saved and printed after exit without QR, PIN, or account data', (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tuiline-login-log-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'login.log');
  const logger = createLoginLog({ file, now: () => new Date('2026-11-17T00:00:00Z') });
  const view = {
    status: 'idle',
    account: { name: 'PRIVATE-NAME' },
    messages: [{ text: 'PRIVATE-TEXT' }],
    login: {
      stage: 'phone',
      statusText: '請在手機上確認登入',
      pin: '123456',
      image: 'PRIVATE-QR',
      attempt: 'PRIVATE-ID',
    },
  };
  logger.record(view);
  logger.record(view);
  logger.record({ ...view, login: { ...view.login, stage: 'uncertain', statusText: '無法儲存登入資料' } });
  const saved = readFileSync(file, 'utf8');
  assert.equal(saved.trim().split('\n').length, 2);
  assert.match(saved, /login:phone/);
  assert.match(saved, /無法儲存登入資料/);
  assert.doesNotMatch(saved, /123456|PRIVATE/);
  let output = '';
  logger.print({
    write: (value) => {
      output += value;
    },
  });
  assert.match(output, /LINE login diagnostics/);
  assert.match(output, /無法儲存登入資料/);
  const once = output;
  logger.print({
    write: (value) => {
      output += value;
    },
  });
  assert.equal(output, once);
});

test('unwritable login log retains diagnostics for the terminal', () => {
  const logger = createLoginLog({ file: '/dev/null/login.log' });
  logger.record({ login: { stage: 'error', statusText: '登入失敗' } });
  let output = '';
  logger.print({
    write: (value) => {
      output += value;
    },
  });
  assert.match(output, /登入失敗/);
  assert.match(output, /Could not write login log/);
});
