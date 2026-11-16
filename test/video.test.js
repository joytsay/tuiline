'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { existsSync, writeFileSync } = require('node:fs');
const { fileURLToPath } = require('node:url');
const { playVideo } = require('../line-tui/video');

for (const outcome of ['success', 'missing-player', 'download-error', 'changed-chat']) {
  test(`video playback cleans up without taking over the terminal: ${outcome}`, async () => {
    const backend = new EventEmitter();
    const context = { id: 'chat', session: 'session', selection: 1 };
    let file;

    const renderer = { suspend: () => assert.fail('Pane playback must not suspend the TUI') };
    backend.command = (command) => {
      if (command.action !== 'download') return;
      file = fileURLToPath(command.url);
      backend.emit('state', { ...context, selectedId: context.id, fileStatus: 'pending' });
      if (outcome === 'success' || outcome === 'missing-player') writeFileSync(file, 'video');
      backend.emit('state', {
        ...context,
        selectedId: outcome === 'changed-chat' ? 'other' : context.id,
        fileStatus: 'idle',
        sendNote: outcome === 'download-error' ? 'Download failed' : 'File saved',
      });
    };
    const spawnPlayer = (command, args, options) => {
      assert.equal(command, 'mpv');
      assert.ok(args.includes('--vo=null'));
      const socketPath = args.find((arg) => arg.startsWith('--input-ipc-server=')).split('=')[1];
      writeFileSync(socketPath, '');
      assert.equal(args.at(-1), file);
      assert.deepEqual(options.stdio, ['ignore', 'ignore', 'pipe']);
      assert.equal(existsSync(file), true);
      const child = new EventEmitter();
      process.nextTick(() => {
        if (outcome === 'missing-player') child.emit('error', { code: 'ENOENT' });
        else setTimeout(() => child.emit('close', 0), 220);
        if (outcome === 'missing-player') child.emit('close', null);
      });
      return child;
    };
    let frames = 0;
    const createSocket = () => {
      const socket = new EventEmitter();
      socket.destroy = () => {};
      socket.write = (line) => {
        const request = JSON.parse(line);
        if (request.command[0] === 'screenshot-to-file') {
          writeFileSync(request.command[1], 'frame');
          process.nextTick(() => socket.emit('data', '{"request_id":1,"error":"success"}\n'));
        }
      };
      process.nextTick(() => socket.emit('connect'));
      return socket;
    };
    const promise = playVideo(renderer, backend, context, '123', {
      spawnPlayer,
      createSocket,
      onFrame: () => {
        frames++;
      },
    });
    if (outcome === 'success') await promise;
    else await assert.rejects(promise, /Install mpv|Download failed|canceled/);
    assert.equal(existsSync(file), false);
    if (outcome === 'success') assert.ok(frames > 0);
    assert.equal(backend.listenerCount('state'), 0);
    assert.equal(backend.listenerCount('failure'), 0);
  });
}
