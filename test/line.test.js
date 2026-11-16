'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Backend, resolveBackend } = require('../line-tui/backend');
const { createApp, clean } = require('../line-tui/app');

test('LINE backend streams demo state and sends text without an account', async (t) => {
  let binary;
  try {
    binary = resolveBackend();
  } catch {
    t.skip('Reference LINE backend is not installed');
    return;
  }
  const backend = new Backend(binary, 'demo');
  t.after(() => backend.close());
  const wait = (predicate) =>
    new Promise((resolve, reject) => {
      const listener = (view) => {
        if (!predicate(view)) return;
        // eslint-disable-next-line no-use-before-define
        clearTimeout(timer);
        backend.off('state', listener);
        resolve(view);
      };
      const timer = setTimeout(() => {
        backend.off('state', listener);
        reject(new Error('LINE demo timeout'));
      }, 5000);
      backend.on('state', listener);
    });
  const ready = await wait((view) => view.chats.length && view.selectedId && view.status === 'ready');
  const context = { id: ready.selectedId, session: ready.session, selection: ready.selection };
  const sent = wait((view) => view.messages.some((message) => message.text === 'Terminal demo test'));
  backend.command({ action: 'draft', ...context, text: 'Terminal demo test', sequence: 1 });
  backend.command({ action: 'send', ...context, text: 'Terminal demo test' });
  const final = await sent;
  assert.equal(final.sendStatus, 'idle');
  assert.equal(final.draft, '');
});

test('LINE UI renders history, composes, and preserves unacknowledged drafts', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 100, height: 30 });
  const backend = new EventEmitter();
  const commands = [];
  backend.command = (command) => commands.push(command);
  backend.close = () => {};
  const app = await createApp(setup.renderer, backend);
  t.after(() => {
    app.dispose();
    setup.renderer.destroy();
  });
  const view = {
    mode: 'demo',
    statusText: 'Ready',
    chats: [{ id: 'demo-0', name: 'Alice', preview: 'Hello', unread: 2 }],
    messages: [{ id: '1', sender: 'Alice', text: 'Hello from LINE', time: '12:00' }],
    selectedId: 'demo-0',
    session: 'session',
    selection: 1,
    draft: '',
    account: { name: 'Me' },
  };
  backend.emit('state', view);
  await setup.renderOnce();
  const frame = setup.captureCharFrame();
  assert.match(frame, /Alice/);
  assert.match(frame, /Hello from LINE/);
  setup.mockInput.pressKey('i');
  assert.equal(app.input.value, '');
  app.input.value = 'My draft';
  backend.emit('state', { ...view, watching: true });
  assert.equal(app.input.value, 'My draft');
  setup.mockInput.pressEnter();
  assert.equal(commands.at(-1).action, 'send');
  assert.equal(commands.at(-2).action, 'draft');
  assert.equal(commands.at(-1).text, 'My draft');
  backend.emit('state', { ...view, draftAck: 1 });
  assert.equal(app.input.value, '');
  backend.emit('state', {
    ...view,
    login: {
      active: true,
      statusText: 'Confirm on your phone',
      pin: '123456',
      canConfirm: true,
      attempt: 'login-1',
    },
  });
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /123456/);
  setup.mockInput.pressKey('y', { ctrl: true });
  assert.deepEqual(commands.at(-1), { action: 'login-confirm', attempt: 'login-1' });
  backend.emit('failure', 'Disconnected');
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /Disconnected/);
});

test('LINE protocol rejects malformed frames and strips terminal controls', () => {
  const backend = Object.create(Backend.prototype);
  EventEmitter.call(backend);
  backend.buffer = '';
  let failure;
  backend.fail = (message) => {
    failure = message;
  };
  backend.consume('{"type":"state",');
  assert.equal(failure, undefined);
  backend.consume('"view":{}}\n');
  assert.match(failure, /Invalid/);
  assert.equal(clean('hello\x1b[2J\x07'), 'hello[2J');
});

test('chat navigation keeps wrapped rows and their marker visible throughout the list', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 90, height: 20 });
  const backend = new EventEmitter();
  backend.command = () => {};
  backend.close = () => {};
  const app = await createApp(setup.renderer, backend);
  t.after(() => {
    app.dispose();
    setup.renderer.destroy();
  });
  const chats = Array.from({ length: 60 }, (_, index) => ({
    id: `chat-${index}`,
    name: `Chat ${index} 永慶房屋團隊 很長的群組名稱`,
    preview: 'A preview that wraps over multiple lines in a narrow terminal',
  }));
  backend.emit('state', { chats, messages: [], selectedId: chats[0].id, session: 'test' });
  await setup.renderOnce();
  const assertSelectedVisible = (index) => {
    const frame = setup.captureCharFrame();
    assert.match(frame, new RegExp(`› Chat ${index} `));
    assert.equal((frame.match(/›/g) || []).length, 1);
  };
  assertSelectedVisible(0);
  for (let index = 1; index < chats.length; index++) {
    setup.mockInput.pressKey('j');
    await setup.renderOnce();
    assertSelectedVisible(index);
  }
  setup.resize(65, 16);
  await setup.renderOnce();
  await setup.renderOnce();
  assertSelectedVisible(59);
  for (let index = 58; index >= 0; index--) {
    setup.mockInput.pressKey('k');
    await setup.renderOnce();
    assertSelectedVisible(index);
  }
});

test('gx opens one hyperlink and provides a keyboard picker for multiple links', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 100, height: 30 });
  const backend = new EventEmitter();
  backend.command = () => {};
  backend.close = () => {};
  const opened = [];
  const app = await createApp(setup.renderer, backend, { openLink: (url) => opened.push(url) });
  t.after(() => {
    app.dispose();
    setup.renderer.destroy();
  });
  const view = { chats: [], messages: [{ text: 'Visit https://example.com.' }], selectedId: 'test' };
  backend.emit('state', view);
  await setup.mockInput.pressKeys(['g', 'x']);
  assert.deepEqual(opened, ['https://example.com']);
  backend.emit('state', { ...view, messages: [{ text: 'https://example.com https://example.org' }] });
  await setup.mockInput.pressKeys(['g', 'x']);
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /Open link/);
  setup.mockInput.pressArrow('down');
  setup.mockInput.pressEnter();
  assert.equal(opened.at(-1), 'https://example.org');
  await setup.mockInput.pressKeys(['g', 'x']);
  setup.mockInput.pressEscape();
  assert.equal(opened.length, 2);
});

test('conversation focus starts in scroll mode and Escape restores Vim scrolling from insert', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 100, height: 24, kittyKeyboard: true });
  const backend = new EventEmitter();
  const commands = [];
  backend.command = (command) => commands.push(command);
  backend.close = () => {};
  const app = await createApp(setup.renderer, backend);
  t.after(() => {
    app.dispose();
    setup.renderer.destroy();
  });
  backend.emit('state', {
    chats: [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ],
    messages: Array.from({ length: 70 }, (_, i) => ({ id: String(i), text: `Message ${i}` })),
    selectedId: 'alice',
    session: 'test',
  });
  await setup.renderOnce();
  setup.mockInput.pressEnter();
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /SCROLL/);
  const history = setup.renderer.root.findDescendantById('line-history');
  const selected = () => {
    const marked = Array.from({ length: 70 }, (_, index) =>
      setup.renderer.root.findDescendantById(`line-message-${index}`),
    ).find(
      (row) =>
        row
          .getChildren()[0]
          .chunks.map((chunk) => chunk.text)
          .join('') === '›',
    );
    return Number(marked.id.split('-').at(-1));
  };
  assert.equal(selected(), 69);
  setup.mockInput.pressKey('k');
  assert.equal(selected(), 68);
  setup.mockInput.pressKey('j');
  assert.equal(selected(), 69);
  setup.mockInput.pressKey('u', { ctrl: true });
  assert.ok(selected() < 69);
  const halfPageTarget = selected();
  setup.mockInput.pressKey('d', { ctrl: true });
  assert.ok(selected() > halfPageTarget);
  assert.equal(commands.filter((command) => command.action === 'select').length, 0);
  const beforeInsert = selected();
  const beforeScroll = history.scrollTop;
  setup.mockInput.pressKey('i');
  await setup.mockInput.typeText('jk');
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /INSERT/);
  assert.equal(app.input.value, 'jk');
  assert.equal(history.scrollTop, beforeScroll);
  setup.mockInput.pressEscape();
  setup.mockInput.pressKey('k');
  assert.equal(selected(), beforeInsert - 1);
  assert.equal(app.input.value, 'jk');
  setup.mockInput.pressTab();
  setup.mockInput.pressKey('j');
  assert.deepEqual(commands.at(-1), { action: 'select', id: 'bob' });
  setup.mockInput.pressTab();
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /SCROLL/);
});

test('message cursor scopes gx and sent ticks change only with a read receipt', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 100, height: 30, kittyKeyboard: true });
  const backend = new EventEmitter();
  backend.command = () => {};
  backend.close = () => {};
  const opened = [];
  const app = await createApp(setup.renderer, backend, { openLink: (url) => opened.push(url) });
  t.after(() => {
    app.dispose();
    setup.renderer.destroy();
  });
  const view = {
    status: 'ready',
    selectedId: 'chat',
    session: 'test',
    chats: [],
    messages: [
      { id: '1', own: true, status: 'ok', text: 'https://first.example' },
      { id: '2', sender: 'Alice', text: 'https://second.example' },
    ],
  };
  backend.emit('state', view);
  setup.mockInput.pressEnter();
  setup.mockInput.pressKey('k');
  await setup.mockInput.pressKeys(['g', 'x']);
  assert.deepEqual(opened, ['https://first.example']);
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /You ✓/);
  assert.doesNotMatch(setup.captureCharFrame(), /✓✓/);
  backend.emit('state', { ...view, messages: [{ ...view.messages[0], read: true }, view.messages[1]] });
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /You ✓✓/);
  await setup.mockInput.pressKeys(['g', 'x']);
  assert.equal(opened.at(-1), 'https://first.example');
});

test('selected photos and supplied stickers load as native terminal images; stale previews are ignored', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 100, height: 35, kittyKeyboard: true });
  const backend = new EventEmitter();
  const commands = [];
  backend.command = (command) => commands.push(command);
  backend.close = () => {};
  const app = await createApp(setup.renderer, backend);
  t.after(() => {
    app.dispose();
    setup.renderer.destroy();
  });
  const png = [
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1Pe',
    'AAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  ].join('');
  const view = {
    status: 'ready',
    selectedId: 'chat',
    session: 'test',
    selection: 1,
    chats: [],
    messages: [
      { id: '1', text: '[Sticker]', sticker: { id: '123', hash: 'abc' } },
      { id: '2', text: '[Image]', contentType: 1, downloadable: true },
    ],
    stickerImages: { '123-abc': png },
  };
  backend.emit('state', view);
  await setup.renderOnce();
  setup.mockInput.pressEnter();
  assert.deepEqual(commands.at(-1), { action: 'preview', id: 'chat', session: 'test', selection: 1, messageId: '2' });
  backend.emit('state', { ...view, preview: png, previewMessageId: '2' });
  const photo = setup.renderer.root.findDescendantById('line-image-1');
  const sticker = setup.renderer.root.findDescendantById('line-image-0');
  await Promise.all([photo.loadPromise, sticker.loadPromise]);
  assert.equal(photo.visible, true);
  assert.equal(sticker.visible, true);
  assert.ok(photo.image, String(photo.loadError));
  assert.ok(sticker.image, String(sticker.loadError));
  await setup.renderOnce();
  backend.emit('state', { ...view, selectedId: 'other', preview: png, previewMessageId: '2' });
  const stalePhoto = setup.renderer.root.findDescendantById('line-image-1');
  assert.equal(stalePhoto.visible, false);
});

test('full-page and half-page scrolling work inside a single long message', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 80, height: 20, kittyKeyboard: true });
  const backend = new EventEmitter();
  backend.command = () => {};
  backend.close = () => {};
  const app = await createApp(setup.renderer, backend);
  t.after(() => {
    app.dispose();
    setup.renderer.destroy();
  });
  backend.emit('state', {
    chats: [],
    selectedId: 'chat',
    messages: [{ id: '1', text: Array.from({ length: 60 }, (_, index) => `Line ${index}`).join('\n') }],
  });
  await setup.renderOnce();
  setup.mockInput.pressEnter();
  const history = setup.renderer.root.findDescendantById('line-history');
  history.scrollTo(0);
  const fullPage = history.viewport.height;
  const halfPage = Math.max(1, Math.floor(fullPage / 2));
  setup.mockInput.pressKey('d', { ctrl: true });
  assert.equal(history.scrollTop, halfPage);
  setup.mockInput.pressKey('u', { ctrl: true });
  assert.equal(history.scrollTop, 0);
  setup.mockInput.pressKey('f', { ctrl: true });
  assert.equal(history.scrollTop, fullPage);
  setup.mockInput.pressKey('b', { ctrl: true });
  assert.equal(history.scrollTop, 0);
  setup.mockInput.pressKey('u', { ctrl: true });
  assert.equal(history.scrollTop, 0);
  setup.mockInput.pressKey('b', { ctrl: true });
  assert.equal(history.scrollTop, 0);
});

test('large chat lists survive repeated backend frames without exhausting native text resources', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 120, height: 35 });
  const backend = Object.create(Backend.prototype);
  EventEmitter.call(backend);
  backend.mode = 'live';
  backend.buffer = '';
  backend.command = () => {};
  backend.close = () => {};
  backend.fail = (message) => assert.fail(message);
  const app = await createApp(setup.renderer, backend);
  t.after(() => {
    app.dispose();
    setup.renderer.destroy();
  });
  const chats = Array.from({ length: 1141 }, (_, index) => ({
    id: `chat-${index}`,
    name: `Chat ${index} 女主微`,
    preview: 'Open chat',
  }));
  for (let update = 0; update < 10; update++) {
    const frame = `${JSON.stringify({
      type: 'state',
      view: {
        mode: 'live',
        status: 'ready',
        selectedId: 'chat-0',
        session: 'test',
        chats: chats.map((chat, index) => ({ ...chat, unread: index === 0 ? update : 0 })),
        messages: [{ id: '1', text: `Message update ${update}` }],
      },
    })}\n`;
    // Include fragmented frames as seen with large real account snapshots.
    backend.consume(frame.slice(0, 70000));
    backend.consume(frame.slice(70000));
    await setup.renderOnce();
    assert.match(setup.captureCharFrame(), new RegExp(`Message update ${update}`));
    assert.match(setup.captureCharFrame(), /Chats \(1141\)/);
  }
});

test('a UI listener exception is never misreported as invalid backend JSON', () => {
  const backend = Object.create(Backend.prototype);
  EventEmitter.call(backend);
  backend.mode = 'live';
  backend.buffer = '';
  backend.fail = (message) => assert.fail(message);
  backend.on('state', () => {
    throw new Error('UI rendering failed');
  });
  assert.throws(
    () =>
      backend.consume(
        `${JSON.stringify({
          type: 'state',
          view: {
            mode: 'live',
            chats: [],
            messages: [],
          },
        })}\n`,
      ),
    /UI rendering failed/,
  );
});

test('gg and G jump to list boundaries without interfering with gx or insert mode', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 100, height: 25, kittyKeyboard: true });
  const backend = new EventEmitter();
  const commands = [];
  backend.command = (command) => commands.push(command);
  backend.close = () => {};
  const opened = [];
  const app = await createApp(setup.renderer, backend, { openLink: (url) => opened.push(url) });
  t.after(() => {
    app.dispose();
    setup.renderer.destroy();
  });
  backend.emit('state', {
    chats: Array.from({ length: 30 }, (_, index) => ({ id: `chat-${index}`, name: `Chat ${index}` })),
    messages: Array.from({ length: 50 }, (_, index) => ({
      id: String(index),
      text: `Message ${index} https://example.com/${index}`,
    })),
    selectedId: 'chat-0',
    session: 'test',
  });
  await setup.renderOnce();
  setup.mockInput.pressKey('g', { shift: true });
  assert.deepEqual(commands.at(-1), { action: 'select', id: 'chat-29' });
  await setup.mockInput.pressKeys(['g', 'g']);
  assert.deepEqual(commands.at(-1), { action: 'select', id: 'chat-0' });
  setup.mockInput.pressEnter();
  await setup.mockInput.pressKeys(['g', 'g']);
  const history = setup.renderer.root.findDescendantById('line-history');
  assert.equal(history.scrollTop, 0);
  await setup.mockInput.pressKeys(['g', 'x']);
  assert.equal(opened.at(-1), 'https://example.com/0');
  setup.mockInput.pressKey('g', { shift: true });
  assert.equal(history.scrollTop, Math.max(0, history.scrollHeight - history.viewport.height));
  await setup.mockInput.pressKeys(['g', 'x']);
  assert.equal(opened.at(-1), 'https://example.com/49');
  setup.mockInput.pressKey('i');
  await setup.mockInput.typeText('ggG');
  assert.equal(app.input.value, 'ggG');
});

test('h leaves conversation focus and l enters scroll mode while insert mode keeps both as text', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 110, height: 25, kittyKeyboard: true });
  const backend = new EventEmitter();
  const commands = [];
  backend.command = (command) => commands.push(command);
  backend.close = () => {};
  const app = await createApp(setup.renderer, backend);
  t.after(() => {
    app.dispose();
    setup.renderer.destroy();
  });
  backend.emit('state', {
    chats: [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ],
    messages: [
      { id: '1', text: 'First' },
      { id: '2', text: 'Second' },
    ],
    selectedId: 'alice',
    session: 'test',
  });
  await setup.renderOnce();
  setup.mockInput.pressKey('l');
  setup.mockInput.pressKey('k');
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /SCROLL/);
  assert.equal(commands.length, 0);
  setup.mockInput.pressKey('h');
  setup.mockInput.pressKey('j');
  assert.deepEqual(commands.at(-1), { action: 'select', id: 'bob' });
  setup.mockInput.pressKey('l');
  setup.mockInput.pressKey('i');
  await setup.mockInput.typeText('hl');
  assert.equal(app.input.value, 'hl');
  setup.mockInput.pressEscape();
  setup.mockInput.pressKey('h');
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /CHATS/);
  setup.mockInput.pressKey('l', { ctrl: true });
  assert.equal(commands.at(-1).action, 'login');
});

test('l expands the selected image and h or Escape restores the conversation', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 110, height: 30, kittyKeyboard: true });
  const backend = new EventEmitter();
  backend.command = () => {};
  backend.close = () => {};
  const app = await createApp(setup.renderer, backend);
  t.after(() => {
    app.dispose();
    setup.renderer.destroy();
  });
  const png = [
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1Pe',
    'AAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  ].join('');
  const view = {
    chats: [{ id: 'chat', name: 'Alice' }],
    selectedId: 'chat',
    session: 'test',
    selection: 1,
    status: 'ready',
    messages: [
      ...Array.from({ length: 20 }, (_, index) => ({ id: String(index), text: `Message ${index}` })),
      { id: '123', text: '[Image]', contentType: 1, downloadable: true },
    ],
    draft: 'saved draft',
  };
  backend.emit('state', view);
  await setup.renderOnce();
  setup.mockInput.pressKey('l');
  const history = setup.renderer.root.findDescendantById('line-history');
  setup.mockInput.pressKey('l');
  await setup.renderOnce();
  const overlay = setup.renderer.root.findDescendantById('line-expanded-view');
  const image = setup.renderer.root.findDescendantById('line-expanded-image');
  assert.equal(overlay.visible, true);
  assert.match(setup.captureCharFrame(), /Loading image/);
  backend.emit('state', { ...view, preview: png, previewMessageId: '123' });
  await image.loadPromise;
  await setup.renderOnce();
  assert.ok(image.image);
  assert.ok(image.width >= history.viewport.width);
  assert.ok(image.height >= history.viewport.height - 1);
  setup.resize(85, 24);
  await setup.renderOnce();
  assert.ok(image.width >= history.viewport.width);
  assert.ok(image.height >= history.viewport.height - 1);
  const scrollTop = history.scrollTop;
  setup.mockInput.pressKey('i');
  assert.equal(app.input.value, 'saved draft');
  setup.mockInput.pressKey('h');
  await setup.renderOnce();
  assert.equal(overlay.visible, false);
  assert.equal(image.source, undefined);
  assert.equal(app.input.value, 'saved draft');
  assert.equal(history.scrollTop, scrollTop);
  assert.match(setup.captureCharFrame(), /SCROLL/);
  setup.mockInput.pressKey('l');
  assert.equal(overlay.visible, true);
  setup.mockInput.pressEscape();
  assert.equal(overlay.visible, false);
  setup.mockInput.pressEnter();
  assert.equal(overlay.visible, false);
  setup.mockInput.pressKey('l');
  assert.equal(overlay.visible, true);
  backend.emit('state', { ...view, selectedId: 'other' });
  assert.equal(overlay.visible, false);
});
