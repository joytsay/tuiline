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

test('LINE UI places incoming messages left and own messages right', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 100, height: 30 });
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
    messages: [
      { id: '1', own: true, text: 'Outgoing message', replyTo: '2' },
      { id: '2', own: false, sender: 'Alice', text: 'Incoming message' },
      { id: '3', own: true, text: 'Short' },
      { id: '4', own: true, text: 'A long outgoing message '.repeat(5) },
    ],
  });
  await setup.renderOnce();
  const lines = setup.captureCharFrame().split('\n');
  const outgoing = lines.find((line) => line.includes('Outgoing message'));
  const incoming = lines.find((line) => line.includes('Incoming message'));
  assert.ok(outgoing);
  assert.ok(incoming);
  assert.ok(outgoing.indexOf('Outgoing message') > incoming.indexOf('Incoming message'));
  const short = lines.find((line) => line.includes('Short'));
  assert.ok(short);
  assert.equal(short.indexOf('Short'), outgoing.indexOf('Outgoing message'));
  const history = setup.renderer.root.findDescendantById('line-history');
  const ownContent = setup.renderer.root.findDescendantById('line-message-0').getChildren()[1];
  assert.equal(ownContent.width, 40);
  assert.equal(ownContent.x + ownContent.width, history.viewport.x + history.viewport.width);
});

test('j reveals the complete last message', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 100, height: 20 });
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
    messages: Array.from({ length: 20 }, (_, index) => ({
      id: String(index),
      text:
        index === 19
          ? `Last message\n${Array.from({ length: 30 }, (_, line) => `Long line ${line}`).join('\n')}\nFinal line`
          : `Message ${index}`,
    })),
  });
  await setup.renderOnce();
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /Final line/);
  setup.mockInput.pressKey('h');
  setup.mockInput.pressKey('l');
  await setup.mockInput.pressKeys(['g', 'g']);
  await setup.renderOnce();
  assert.doesNotMatch(setup.captureCharFrame(), /Final line/);
  setup.mockInput.pressKey('h');
  setup.mockInput.pressKey('l');
  await setup.renderOnce();
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /Final line/);
  assert.match(setup.captureCharFrame(), /SCROLL \[20\/20\]/);
  setup.mockInput.pressEnter();
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /Final line/);
  await setup.mockInput.pressKeys(['g', 'g']);
  await setup.renderOnce();
  for (let index = 0; index < 100; index++) {
    setup.mockInput.pressKey('j');
    await setup.renderOnce();
  }
  assert.match(setup.captureCharFrame(), /Final line/);
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

test('l/L opens one hyperlink and provides a keyboard picker for multiple links', async (t) => {
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
  setup.mockInput.pressEnter();
  setup.mockInput.pressKey('L');
  assert.deepEqual(opened, ['https://example.com']);
  backend.emit('state', { ...view, messages: [{ text: 'https://example.com https://example.org' }] });
  setup.mockInput.pressKey('L');
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /Open link/);
  setup.mockInput.pressKey('J');
  setup.mockInput.pressKey('K');
  setup.mockInput.pressKey('J');
  setup.mockInput.pressKey('L');
  assert.equal(opened.at(-1), 'https://example.org');
  setup.mockInput.pressKey('L');
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

test('message cursor scopes l/L and sent ticks change only with a read receipt', async (t) => {
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
  setup.mockInput.pressKey('L');
  assert.deepEqual(opened, ['https://first.example']);
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /You ✓/);
  assert.doesNotMatch(setup.captureCharFrame(), /✓✓/);
  backend.emit('state', { ...view, messages: [{ ...view.messages[0], read: true }, view.messages[1]] });
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /You ✓✓/);
  setup.mockInput.pressKey('L');
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

test('gg and G jump to list boundaries without interfering with l/L or insert mode', async (t) => {
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
  setup.mockInput.pressKey('L');
  assert.equal(opened.at(-1), 'https://example.com/0');
  setup.mockInput.pressKey('g', { shift: true });
  assert.equal(history.scrollTop, Math.max(0, history.scrollHeight - history.viewport.height));
  setup.mockInput.pressKey('L');
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
  setup.mockInput.pressKey('L');
  setup.mockInput.pressKey('K');
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /SCROLL/);
  assert.equal(commands.length, 0);
  setup.mockInput.pressKey('H');
  setup.mockInput.pressKey('J');
  assert.deepEqual(commands.at(-1), { action: 'select', id: 'bob' });
  setup.mockInput.pressKey('L');
  setup.mockInput.pressKey('i');
  await setup.mockInput.typeText('hlJKHL');
  assert.equal(app.input.value, 'hlJKHL');
  setup.mockInput.pressEscape();
  setup.mockInput.pressKey('H');
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
  await setup.renderOnce();
  const imageScroll = setup.renderer.root.findDescendantById('line-expanded-scroll');
  assert.ok(image.image);
  assert.equal(image.height, imageScroll.viewport.height);
  assert.match(setup.captureCharFrame(), /Full height/);
  setup.mockInput.pressKey('l');
  await setup.renderOnce();
  await setup.renderOnce();
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /Full width/);
  assert.ok(
    setup.captureSpans().lines[image.y + 2].spans.some((span) => span.bg.r > 0.9 && span.bg.g < 0.1),
    'expanded image pixels must be visible near the top of the pane',
  );
  assert.equal(image.width, imageScroll.viewport.width);
  assert.equal(image.height, Math.ceil(image.width / image.cellAspectRatio));
  assert.ok(image.height > imageScroll.viewport.height);
  const historyTop = history.scrollTop;
  setup.mockInput.pressKey('j');
  await setup.renderOnce();
  assert.equal(imageScroll.scrollTop, 1);
  setup.mockInput.pressKey('k');
  await setup.renderOnce();
  assert.equal(imageScroll.scrollTop, 0);
  assert.equal(history.scrollTop, historyTop);
  assert.ok(image.width >= history.viewport.width);
  assert.ok(image.height >= history.viewport.height - 1);
  setup.resize(85, 24);
  await setup.renderOnce();
  await setup.renderOnce();
  assert.equal(image.height, Math.ceil(image.width / image.cellAspectRatio));
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
  await setup.renderOnce();
  await setup.renderOnce();
  assert.equal(image.height, imageScroll.viewport.height);
  setup.mockInput.pressEscape();
  assert.equal(overlay.visible, false);
  setup.mockInput.pressEnter();
  assert.equal(overlay.visible, false);
  setup.mockInput.pressKey('l');
  assert.equal(overlay.visible, true);
  backend.emit('state', { ...view, selectedId: 'other' });
  assert.equal(overlay.visible, false);
});

test('LINE input stays inside the message border after resizing', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 100, height: 25 });
  const backend = new EventEmitter();
  backend.command = () => {};
  backend.close = () => {};
  const app = await createApp(setup.renderer, backend);
  t.after(() => {
    app.dispose();
    setup.renderer.destroy();
  });
  for (const width of [100, 65, 150]) {
    setup.resize(width, 25);
    app.input.focus();
    app.input.value = 'A long message '.repeat(30);
    await setup.renderOnce();
    await setup.renderOnce();
    const pane = app.input.parent;
    assert.equal(app.input.x, pane.x + 1);
    assert.equal(app.input.x + app.input.width, pane.x + pane.width - 1);
    assert.equal(setup.captureCharFrame().split('\n')[app.input.y][pane.x + pane.width - 1], '│');
  }
});

test('Escape from insert preserves the viewport when selection is off screen', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 100, height: 25, kittyKeyboard: true });
  const backend = new EventEmitter();
  backend.command = () => {};
  backend.close = () => {};
  const app = await createApp(setup.renderer, backend);
  t.after(() => {
    app.dispose();
    setup.renderer.destroy();
  });
  backend.emit('state', {
    chats: [{ id: 'chat', name: 'Alice' }],
    selectedId: 'chat',
    messages: Array.from({ length: 50 }, (_, index) => ({ id: String(index), text: `Message ${index}` })),
  });
  await setup.renderOnce();
  setup.mockInput.pressKey('l');
  setup.mockInput.pressKey('g');
  setup.mockInput.pressKey('g');
  await setup.renderOnce();
  const history = setup.renderer.root.findDescendantById('line-history');
  history.scrollTo(history.scrollHeight);
  await setup.renderOnce();
  const scrollTop = history.scrollTop;
  assert.ok(scrollTop > 0);
  setup.mockInput.pressKey('i');
  await setup.mockInput.typeText('draft');
  setup.mockInput.pressEscape();
  await setup.renderOnce();
  assert.equal(history.scrollTop, scrollTop);
  assert.equal(app.input.value, 'draft');
  assert.match(setup.captureCharFrame(), /SCROLL \[1\/50\]/);
});

test('l plays video inside the pane with pause, seek, and return controls', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 100, height: 25, kittyKeyboard: true });
  const backend = new EventEmitter();
  backend.command = () => {};
  backend.close = () => {};
  const calls = [];
  let finish;
  const app = await createApp(setup.renderer, backend, {
    playVideo: (...args) => {
      calls.push(args);
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  t.after(() => {
    app.dispose();
    setup.renderer.destroy();
  });
  backend.emit('state', {
    chats: [{ id: 'chat', name: 'Alice' }],
    selectedId: 'chat',
    session: 'session',
    selection: 1,
    status: 'ready',
    draft: 'saved draft',
    messages: [{ id: '123', contentType: 2, text: '[Video]', downloadable: true }],
  });
  await setup.renderOnce();
  setup.mockInput.pressKey('l');
  setup.mockInput.pressKey('l');
  setup.mockInput.pressKey('l');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][2], { id: 'chat', session: 'session', selection: 1 });
  assert.equal(calls[0][3], '123');
  assert.equal(app.input.value, 'saved draft');
  const controls = [];
  calls[0][4].onProgress({ received: 5 * 1048576, total: 10 * 1048576, stage: 'downloading' });
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /50%/);
  assert.match(setup.captureCharFrame(), /5\.0 MiB \/ 10\.0 MiB/);
  calls[0][4].onProgress({ received: 1048576, total: -1, stage: 'downloading' });
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /size unknown/);
  calls[0][4].onProgress({ stage: 'preparing' });
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /Preparing video/);
  calls[0][4].onReady({ togglePause: () => controls.push('pause'), seek: (seconds) => controls.push(seconds) });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
    'base64',
  );
  calls[0][4].onFrame(png);
  const videoImage = setup.renderer.root.findDescendantById('line-video-image');
  await videoImage.loadPromise;
  await setup.renderOnce();
  const videoView = setup.renderer.root.findDescendantById('line-video-view');
  assert.equal(videoView.visible, true);
  assert.ok(videoImage.x >= videoView.x);
  assert.ok(videoImage.x + videoImage.width <= videoView.x + videoView.width);
  assert.match(setup.captureCharFrame(), /Alice/);
  assert.ok(setup.captureSpans().lines.some((line) => line.spans.some((span) => span.bg.r > 0.9 && span.bg.g < 0.1)));
  setup.mockInput.pressKey(' ');
  setup.mockInput.pressArrow('left');
  setup.mockInput.pressArrow('right');
  assert.deepEqual(controls, ['pause', -5, 5]);
  finish();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(videoView.visible, false);
  assert.equal(videoImage.source, undefined);
  setup.mockInput.pressKey('l');
  assert.equal(calls.length, 2);
  setup.mockInput.pressEscape();
  assert.equal(calls[1][4].signal.aborted, true);
  finish();
});

test('history starts at newest after delayed load and r replies to the highlighted LINE message', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 110, height: 30, kittyKeyboard: true });
  const backend = new EventEmitter();
  const commands = [];
  backend.command = (command) => commands.push(command);
  backend.close = () => {};
  const app = await createApp(setup.renderer, backend);
  t.after(() => {
    app.dispose();
    setup.renderer.destroy();
  });
  const base = { chats: [], messages: [], selectedId: 'chat', session: 'test', selection: 1 };
  backend.emit('state', base);
  const messages = ['100', '101', '102'].map((id) => ({ id, sender: 'Alice', text: `Message ${id}` }));
  backend.emit('state', { ...base, messages });
  setup.mockInput.pressKey('i');
  setup.mockInput.pressEscape();
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /SCROLL \[3\/3\]/);
  setup.mockInput.pressKey('k');
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /SCROLL \[2\/3\]/);
  setup.mockInput.pressKey('r');
  assert.deepEqual(commands.at(-1), {
    action: 'reply',
    id: 'chat',
    session: 'test',
    selection: 1,
    messageId: '101',
  });
  backend.emit('state', { ...base, messages, reply: { id: '101', sender: 'Alice', text: 'Message 101' } });
  await setup.renderOnce();
  assert.match(setup.captureCharFrame(), /Reply to Alice: Message 101/);
  assert.match(setup.captureCharFrame(), /INSERT/);
  app.input.value = 'A reply';
  setup.mockInput.pressEnter();
  assert.equal(commands.at(-1).action, 'send');
  assert.equal(commands.at(-1).text, 'A reply');
  assert.equal(commands.at(-1).replyTo, '101');
  setup.mockInput.pressEscape();
  setup.mockInput.pressEscape();
  assert.equal(commands.at(-1).action, 'reply-cancel');
});

test('r and Enter send a native reply through the bundled LINE demo backend', async (t) => {
  const { createTestRenderer } = await import('@opentui/core/testing');
  const setup = await createTestRenderer({ width: 110, height: 30, kittyKeyboard: true });
  const backend = new Backend(resolveBackend(), 'demo');
  t.after(() => {
    backend.close();
    setup.renderer.destroy();
  });
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
        reject(new Error('Reply was not sent by the LINE demo backend'));
      }, 5000);
      backend.on('state', listener);
    });
  const ready = await wait((view) => view.status === 'ready' && view.messages.length);
  const app = await createApp(setup.renderer, backend);
  t.after(() => app.dispose());
  backend.emit('state', ready);
  setup.mockInput.pressKey('l');
  const target = ready.messages.at(-1).id;
  const replying = wait((view) => view.reply?.id === target);
  setup.mockInput.pressKey('r');
  await replying;
  app.input.value = 'Native reply regression test';
  const sent = wait((view) => view.messages.some((message) => message.text === 'Native reply regression test'));
  setup.mockInput.pressEnter();
  const result = await sent;
  assert.equal(result.messages.find((message) => message.text === 'Native reply regression test').replyTo, target);
  assert.equal(result.sendStatus, 'idle');
  assert.equal(result.draft, '');
  assert.equal(result.reply, null);
});

test('reply pairs stay highlighted after sending, navigation, and sidebar focus', async (t) => {
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
  const base = { chats: [], selectedId: 'chat', session: 'test', selection: 1 };
  const messages = [
    { id: '100', sender: 'Alice', text: 'Original' },
    { id: '101', sender: 'Alice', text: 'Unrelated' },
  ];
  backend.emit('state', { ...base, messages });
  setup.mockInput.pressKey('l');
  setup.mockInput.pressKey('k');
  setup.mockInput.pressKey('r');
  backend.emit('state', { ...base, messages, reply: { id: '100', sender: 'Alice', text: 'Original' } });
  const node = (index) => setup.renderer.root.findDescendantById(`line-message-${index}`);
  const marker = (index) => setup.renderer.root.findDescendantById(`line-message-marker-${index}`).plainText;
  assert.equal(marker(0), '↪');
  // Follow the newest message, as after sending from the bottom of a conversation.
  setup.mockInput.pressEscape();
  setup.mockInput.pressKey('G');
  setup.mockInput.pressKey('i');
  backend.emit('state', {
    ...base,
    reply: null,
    messages: [...messages, { id: '102', own: true, text: 'The reply', replyTo: '100' }],
  });
  assert.equal(marker(0), '↪');
  assert.equal(marker(2), '↪');
  assert.deepEqual(node(0).backgroundColor, node(2).backgroundColor);
  assert.notDeepEqual(node(0).backgroundColor, node(1).backgroundColor);
  setup.mockInput.pressEscape();
  setup.mockInput.pressKey('k');
  assert.equal(marker(0), '↪');
  assert.equal(marker(2), '↪');
  assert.equal(marker(1), '›');
  setup.mockInput.pressKey('h');
  assert.equal(marker(0), '↪');
  assert.equal(marker(2), '↪');
  assert.deepEqual(node(0).backgroundColor, node(2).backgroundColor);
});

test('separate reply threads use different stable colors and nested replies keep their thread color', async (t) => {
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
  const state = {
    chats: [],
    selectedId: 'chat',
    session: 'test',
    selection: 1,
    messages: [
      { id: '100', text: 'First original' },
      { id: '101', text: 'Second original' },
      { id: '102', text: 'First reply', replyTo: '100' },
      { id: '103', text: 'Second reply', replyTo: '101' },
      { id: '104', text: 'Nested reply', replyTo: '102' },
    ],
  };
  backend.emit('state', state);
  const color = (index) => setup.renderer.root.findDescendantById(`line-message-${index}`).backgroundColor;
  assert.deepEqual(color(0), color(2));
  assert.deepEqual(color(2), color(4));
  assert.deepEqual(color(1), color(3));
  assert.notDeepEqual(color(0), color(1));
  const originalColor = color(0);
  backend.emit('state', { ...state, messages: [{ id: '99', text: 'Earlier' }, ...state.messages] });
  assert.deepEqual(color(1), originalColor);
  assert.deepEqual(color(1), color(3));
});
