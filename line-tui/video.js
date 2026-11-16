'use strict';

const { spawn } = require('node:child_process');
const { createConnection } = require('node:net');
const { existsSync, mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function playVideo(renderer, backend, context, messageId, options = {}) {
  const { signal } = options;
  const directory = mkdtempSync(path.join(tmpdir(), 'tuiline-video-'));
  const file = path.join(directory, 'video.mp4');
  try {
    backend.command({ action: 'preview-close', ...context });
    await new Promise((resolve, reject) => {
      let timer, onState, onFailure, onAbort; // eslint-disable-line prefer-const
      let pending = false;
      const finish = (error) => {
        clearTimeout(timer);
        backend.off('state', onState);
        backend.off('failure', onFailure);
        signal?.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else resolve();
      };
      onFailure = () => finish(new Error('Video download failed: backend disconnected'));
      onAbort = () => {
        finish(new DOMException('Video playback canceled', 'AbortError'));
        backend.command({ action: 'file-cancel', ...context });
      };
      onState = (view) => {
        if (view.fileStatus === 'pending') pending = true;
        if (
          view.session !== context.session ||
          view.selectedId !== context.id ||
          view.selection !== context.selection
        ) {
          onAbort();
        } else if (existsSync(file)) {
          finish();
        } else if (pending && view.fileStatus === 'idle' && view.sendNote) {
          finish(new Error(view.sendNote));
        }
      };
      timer = setTimeout(() => {
        backend.command({ action: 'file-cancel', ...context });
        finish(new Error('Video download timed out'));
      }, 135000);
      backend.on('state', onState);
      backend.on('failure', onFailure);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
      } else {
        backend.command({ action: 'download', ...context, messageId, url: pathToFileURL(file).href });
      }
    });
    signal?.throwIfAborted();
    await renderVideo(file, directory, options);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function renderVideo(
  file,
  directory,
  { signal, onFrame = () => {}, onReady = () => {}, spawnPlayer = spawn, createSocket = createConnection } = {},
) {
  const socketPath = path.join(directory, 'mpv.sock');
  const framePath = path.join(directory, 'frame.jpg');
  return new Promise((resolve, reject) => {
    let socket;
    let connected = false;
    let capturing = false;
    let frameCount = 0;
    let buffer = '';
    let playerError;
    let diagnostic = '';
    const send = (command, requestId = 0) => {
      // mpv's JSON IPC field names use snake case.
      // eslint-disable-next-line camelcase
      if (connected) socket.write(`${JSON.stringify({ command, request_id: requestId })}\n`);
    };
    const tick = () => {
      if (!socket && existsSync(socketPath)) {
        socket = createSocket(socketPath);
        socket.on('error', (error) => {
          playerError = error;
        });
        socket.on('connect', () => {
          connected = true;
          onReady({
            togglePause: () => send(['cycle', 'pause']),
            seek: (seconds) => send(['seek', seconds, 'relative']),
          });
        });
        socket.on('data', (chunk) => {
          buffer += chunk.toString();
          let end;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 1);
            try {
              const response = JSON.parse(line);
              if (response.request_id !== 1) continue;
              capturing = false;
              if (response.error === 'success') {
                onFrame(readFileSync(framePath));
                frameCount++;
              }
            } catch (error) {
              playerError = error;
            }
          }
        });
      }
      if (connected && !capturing) {
        capturing = true;
        send(['screenshot-to-file', framePath, 'video'], 1);
      }
    };
    const child = spawnPlayer(
      'mpv',
      [
        '--no-config',
        '--terminal=no',
        '--input-terminal=no',
        `--input-ipc-server=${socketPath}`,
        '--vo=null',
        '--audio-display=no',
        '--screenshot-format=jpg',
        '--screenshot-jpeg-quality=80',
        '--vf=lavfi=[scale=960:-2]',
        '--',
        file,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'], signal },
    );
    const timer = setInterval(tick, 80);
    child.stderr?.on('data', (chunk) => {
      diagnostic = (diagnostic + chunk.toString()).slice(-2000);
    });
    child.once('error', (error) => {
      playerError = error.code === 'ENOENT' ? new Error('Install mpv to play videos in the pane') : error;
    });
    child.once('close', (code) => {
      clearInterval(timer);
      socket?.destroy();
      if (signal?.aborted) {
        reject(new DOMException('Video playback canceled', 'AbortError'));
      } else if (playerError) {
        reject(playerError);
      } else if (code !== 0 || !frameCount) {
        reject(new Error(`Video playback failed: ${diagnostic || 'no video frames'}`));
      } else {
        resolve();
      }
    });
  });
}

module.exports = { playVideo, renderVideo };
