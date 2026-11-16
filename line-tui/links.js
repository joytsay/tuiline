'use strict';

const { spawn } = require('node:child_process');

function linksIn(messages) {
  const links = new Set();
  for (const message of messages) {
    for (const match of String(message.text || '').matchAll(/https?:\/\/[^\s<>"\u3000-\u303f\uff00-\uffef]+/gu)) {
      let value = match[0].replace(/[.,!?:;]+$/, '');
      while (value.endsWith(')') && value.split(')').length > value.split('(').length) value = value.slice(0, -1);
      try {
        const url = new URL(value);
        if (url.protocol === 'https:' || url.protocol === 'http:') links.add(value);
      } catch {
        // Ignore malformed URLs in message text.
      }
    }
  }
  return [...links];
}

function openUrl(url, onError) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) return;
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child =
    process.platform === 'win32'
      ? spawn('rundll32.exe', ['url.dll,FileProtocolHandler', parsed.href], { stdio: 'ignore' })
      : spawn(command, [parsed.href], { stdio: 'ignore' });
  child.on('error', () => onError('Could not open the browser'));
  child.on('exit', (code) => {
    if (code) onError('Could not open the browser');
  });
}

module.exports = { linksIn, openUrl };
