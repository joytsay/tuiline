'use strict';

const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

function resolveBackend(args = [], env = process.env) {
  const index = args.indexOf('--backend');
  if (index >= 0 && !args[index + 1]) throw new Error('--backend needs a binary path');
  const explicit = index >= 0 ? args[index + 1] : env.LINE_BACKEND;
  if (explicit) return path.resolve(explicit);
  const source = env.LINE_SOURCE || path.resolve(__dirname, '../../line');
  const candidates = [
    path.resolve(__dirname, '../backend-bin/line-gui'),
    path.join(source, 'build/plugin/bin/line-gui'),
  ];
  const found = candidates.find((file) => existsSync(file));
  if (!found) throw new Error('LINE backend missing. Run npm run build:line or set LINE_BACKEND.');
  return found;
}

class Backend extends EventEmitter {
  constructor(binary, mode = 'live') {
    super();
    this.mode = mode;
    this.buffer = '';
    this.closed = false;
    this.child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.consume(chunk));
    this.child.on('error', (error) => this.fail(error.message));
    this.child.stdin.on('error', (error) => this.fail(error.message));
    this.child.on('exit', () => this.fail('LINE backend stopped. Quit and restart to reconnect.'));
    this.child.once('spawn', () => {
      this.command({ action: 'mode', mode });
      this.command({ action: 'notifications', enabled: false });
      this.command({ action: 'refresh' });
    });
  }

  consume(chunk) {
    this.buffer += chunk;
    for (;;) {
      const end = this.buffer.indexOf('\n');
      if (end < 0) break;
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (Buffer.byteLength(line) > 5 * 1024 * 1024) {
        this.fail('LINE frame exceeds limit');
        return;
      }
      let frame;
      try {
        frame = JSON.parse(line);
      } catch {
        this.fail('Invalid LINE backend JSON');
        return;
      }
      if (
        frame?.type !== 'state' ||
        !Array.isArray(frame.view?.chats) ||
        !Array.isArray(frame.view.messages) ||
        frame.view.chats.length > 5000 ||
        frame.view.messages.length > 100
      ) {
        this.fail('Invalid LINE backend response');
        return;
      }
      if (frame.view.mode === this.mode) this.emit('state', frame.view);
    }
    if (Buffer.byteLength(this.buffer) > 5 * 1024 * 1024) this.fail('LINE frame exceeds limit');
  }

  command(value) {
    const line = `${JSON.stringify(value)}\n`;
    if (!this.closed && Buffer.byteLength(line) <= 65536) this.child.stdin.write(line);
  }

  fail(message) {
    if (this.closed) return;
    this.close();
    this.emit('failure', message);
  }

  close() {
    this.closed = true;
    this.child.stdin.end();
    this.child.kill();
  }
}

module.exports = { Backend, resolveBackend };
