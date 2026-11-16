'use strict';

const { Backend, resolveBackend } = require('./backend');
const { linksIn, openUrl } = require('./links');

// Remote strings are plain text; strip terminal control bytes before display.
// eslint-disable-next-line no-control-regex
const clean = (value) => String(value ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');

async function createApp(renderer, backend, { openLink = openUrl } = {}) {
  const { default: stringWidth } = await import('string-width');
  const {
    BoxRenderable: Box,
    TextRenderable: Text,
    InputRenderable: Input,
    ScrollBoxRenderable: ScrollBox,
    ImageRenderable: Image,
    InputRenderableEvents,
  } = await import('@opentui/core');
  const green = '#06c755';
  const root = new Box(renderer, {
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    backgroundColor: '#101714',
  });
  const header = new Text(renderer, { content: ' LINE  ·  Connecting…', fg: green, height: 1 });
  const body = new Box(renderer, { flexDirection: 'row', flexGrow: 1, minHeight: 0 });
  const chats = new ScrollBox(renderer, {
    width: '30%',
    minWidth: 20,
    border: true,
    borderColor: green,
    title: ' Chats ',
  });
  let chatRows = [];
  let chatRowsKey = '';
  const emptyChats = new Text(renderer, { content: ' No chats yet', fg: '#d8e5dd' });
  chats.add(emptyChats);
  const pane = new Box(renderer, {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: 'column',
    border: true,
    borderColor: '#385044',
    title: ' Messages ',
  });
  const history = new ScrollBox(renderer, {
    id: 'line-history',
    contentOptions: { minHeight: 0 },
    flexGrow: 1,
    minHeight: 0,
    stickyScroll: true,
    stickyStart: 'bottom',
  });
  const emptyMessages = new Text(renderer, {
    content: 'Select a chat, or press Ctrl+L to sign in.',
    fg: '#d8e5dd',
    width: '100%',
  });
  history.add(emptyMessages);
  let messageRows = [];
  let messageCursor = 0;
  let openAtBottom = false;
  root.renderBefore = () => {
    if (openAtBottom) {
      history.scrollTo(history.scrollHeight);
      openAtBottom = false;
    }
  };
  const resizeHistory = history.content.onSizeChange;
  history.content.onSizeChange = () => {
    resizeHistory?.call(history.content);
    if (openAtBottom) {
      history.scrollTo(history.scrollHeight);
      openAtBottom = false;
    }
  };
  const loginImage = new Image(renderer, { width: 40, height: 20, visible: false, protocol: 'auto' });
  const loginText = new Text(renderer, { content: '', fg: green, visible: false });
  const input = new Input(renderer, {
    height: 1,
    width: '100%',
    maxLength: 10000,
    placeholder: 'i to insert · Esc to scroll',
    textColor: '#ffffff',
    focusedBackgroundColor: '#20382a',
    cursorColor: green,
  });
  const status = new Text(renderer, { content: '', fg: '#a6bdaf', height: 2 });
  const linkPicker = new Text(renderer, { content: '', fg: green, visible: false, maxHeight: 10 });
  const hints = new Text(renderer, {
    content: ' CHATS · j/k select · l/Enter conversation · i insert · l links/image · ^R refresh · ^C quit',
    fg: green,
    height: 1,
  });
  pane.add(history);
  pane.add(loginImage);
  pane.add(loginText);
  pane.add(linkPicker);
  pane.add(input);
  const expandedView = new Box(renderer, {
    id: 'line-expanded-view',
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    visible: false,
    backgroundColor: '#101714',
    zIndex: 10,
  });
  const expandedScroll = new ScrollBox(renderer, {
    id: 'line-expanded-scroll',
    flexGrow: 1,
    minHeight: 0,
    scrollX: false,
  });
  const expandedImage = new Image(renderer, {
    id: 'line-expanded-image',
    width: '100%',
    height: 1,
    flexShrink: 0,
    fit: 'fit',
    protocol: 'auto',
  });
  const expandedNote = new Text(renderer, { content: 'Loading image…', height: 1, fg: green });
  const sizeExpandedImage = () => {
    const image = expandedImage.image;
    if (!image) return;
    expandedImage.height = Math.max(
      1,
      Math.ceil((expandedImage.width * expandedImage.cellAspectRatio * image.height) / image.width),
    );
  };
  expandedImage.onLoad = sizeExpandedImage;
  expandedView.renderBefore = sizeExpandedImage;
  expandedImage.onError = () => {
    expandedNote.content = 'Cannot display this image · h / Esc to return';
  };
  expandedScroll.add(expandedImage);
  expandedView.add(expandedScroll);
  expandedView.add(expandedNote);
  pane.add(expandedView);
  body.add(chats);
  body.add(pane);
  root.add(header);
  root.add(body);
  root.add(status);
  root.add(hints);
  renderer.root.add(root);
  let view = { chats: [], messages: [] };
  let cursor = 0;
  let mode = 'chats';
  let failed = false;
  let sequence = 0;
  let draftTimer;
  let draftContext;
  let pendingDraft = false;
  let syncing = false;
  let messageKey = '';
  let imageSource = '';
  let linkChoices = [];
  let linkCursor = 0;
  let prefixAt = 0;
  const imageCache = new Map();
  let previewTarget = '';
  let previewContext = '';
  let expandedMessageId = '';
  const safeImage = (source) =>
    typeof source === 'string' &&
    source.length <= 2800000 &&
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(source);
  const context = () => ({ id: view.selectedId, session: view.session, selection: view.selection });
  const flushDraft = () => {
    clearTimeout(draftTimer);
    if (!pendingDraft) return;
    backend.command({ action: 'draft', ...draftContext, text: input.value, sequence: ++sequence });
    pendingDraft = false;
  };
  const focus = (nextMode) => {
    const previousMode = mode;
    mode = nextMode;
    prefixAt = 0;
    if (mode === 'insert') input.focus();
    else input.blur();
    chats.borderColor = mode === 'chats' ? green : '#385044';
    pane.borderColor = mode === 'chats' ? '#385044' : green;
    for (const [index, { marker, row }] of messageRows.entries()) {
      row.backgroundColor = mode === 'history' && index === messageCursor ? '#182a20' : 'transparent';
      marker.content = mode === 'history' && index === messageCursor ? '›' : ' ';
    }
    const help = {
      chats: 'CHATS · j/k select · l/Enter conversation · i insert',
      history: `SCROLL [${messageCursor + 1}/${messageRows.length}] · j/k select · ^D/^U page · i insert · h chats`,
      insert: 'INSERT · Enter send · Esc scroll · Tab chats',
    };
    hints.content = ` ${help[mode]} · l links/image · ^R refresh · ^C quit`;
    if (mode === 'history') {
      if (previousMode === 'chats' && messageRows[messageCursor]) {
        if (messageCursor === messageRows.length - 1) history.scrollTo(history.scrollHeight);
        else history.scrollChildIntoView(messageRows[messageCursor].row.id);
      }
      // eslint-disable-next-line no-use-before-define
      requestPreview();
    }
  };
  const revealChat = () => {
    const selected = chatRows[cursor];
    if (selected) chats.scrollChildIntoView(selected.row.id);
  };
  chats.viewport.onSizeChange = revealChat;
  const paintChats = () => {
    const key = JSON.stringify(view.chats);
    if (key !== chatRowsKey) {
      chatRowsKey = key;
      for (const { row } of chatRows) row.destroyRecursively();
      chatRows = view.chats.map((chat, index) => {
        const row = new Box(renderer, {
          id: `line-chat-${index}`,
          width: '100%',
          flexDirection: 'row',
          flexShrink: 0,
          marginBottom: 1,
          onSizeChange: revealChat,
        });
        const marker = new Text(renderer, { width: 2, flexShrink: 0, content: ' ', fg: green });
        const name = `${clean(chat.name)}${chat.unread ? ` (${chat.unread})` : ''}`;
        const preview = clean(chat.preview).replace(/\n/g, ' ').slice(0, 70);
        row.add(marker);
        row.add(
          new Text(renderer, {
            content: `${name}\n${preview}`,
            fg: '#d8e5dd',
            flexGrow: 1,
            flexShrink: 1,
            minWidth: 0,
          }),
        );
        chats.add(row);
        return { row, marker };
      });
      emptyChats.visible = !chatRows.length;
    }
    for (const [index, { row, marker }] of chatRows.entries()) {
      marker.content = index === cursor ? '›' : ' ';
      row.backgroundColor = index === cursor ? '#20382a' : 'transparent';
    }
  };
  const paintLinks = () => {
    linkPicker.visible = linkChoices.length > 0;
    linkPicker.content = `Open link · j/k choose · Enter/l open · Esc/h cancel\n${linkChoices
      .slice(Math.max(0, linkCursor - 3), linkCursor + 4)
      .map((url) => `${url === linkChoices[linkCursor] ? '›' : ' '} ${clean(url)}`)
      .join('\n')}`;
  };
  const launchLink = (url) => {
    openLink(url, (message) => {
      status.content = clean(message);
    });
    linkChoices = [];
    paintLinks();
  };
  const requestPreview = () => {
    const message = messageRows[messageCursor]?.message;
    const target = message?.contentType === 1 && message.downloadable ? message.id : '';
    const scope = `${view.session}:${view.selectedId}:${view.selection}`;
    if (previewTarget && (target !== previewTarget || scope !== previewContext)) {
      backend.command({ action: 'preview-close', ...context() });
      previewTarget = '';
    }
    if (
      !target ||
      imageCache.has(target) ||
      target === previewTarget ||
      mode !== 'history' ||
      view.status !== 'ready' ||
      view.busy ||
      view.sendStatus === 'pending'
    ) {
      return;
    }
    previewTarget = target;
    previewContext = scope;
    backend.command({ action: 'preview', ...context(), messageId: target });
  };
  const closeExpanded = (restoreFocus = true) => {
    expandedMessageId = '';
    expandedView.visible = false;
    expandedImage.source = undefined;
    if (restoreFocus) focus('history');
  };
  const updateExpanded = () => {
    if (!expandedMessageId) return;
    const selected = messageRows.find(({ message }) => message.id === expandedMessageId);
    const source = selected?.image.source;
    if (expandedImage.source !== source) expandedImage.source = source;
    expandedNote.content = source
      ? 'j/k scroll · h / Esc to return to conversation'
      : 'Loading image… · h / Esc to return';
  };
  const syncImages = () => {
    if (
      previewTarget &&
      view.previewMessageId === previewTarget &&
      safeImage(view.preview) &&
      previewContext === `${view.session}:${view.selectedId}:${view.selection}`
    ) {
      imageCache.set(previewTarget, view.preview);
      if (imageCache.size > 20) imageCache.delete(imageCache.keys().next().value);
    }
    for (const { message, image } of messageRows) {
      const sticker = message.sticker;
      const stickerKey = sticker ? `${sticker.id}${sticker.hash ? `-${sticker.hash}` : ''}` : '';
      const source = imageCache.get(message.id) || view.stickerImages?.[stickerKey];
      image.visible = safeImage(source);
      image.height = 0;
      if (image.visible) image.height = Math.max(1, Math.min(sticker ? 6 : 10, history.viewport.height - 4));
      if (image.source !== (image.visible ? source : undefined)) image.source = image.visible ? source : undefined;
    }
  };
  const onState = (next) => {
    if (failed) return;
    const changed = next.selectedId !== view.selectedId || next.session !== view.session;
    const cursorId = changed ? next.selectedId : view.chats[cursor]?.id;
    view = next;
    cursor = Math.max(
      0,
      view.chats.findIndex((chat) => chat.id === cursorId),
    );
    chats.title = ` Chats (${view.chats.length}) `;
    if (changed) {
      closeExpanded(false);
      imageCache.clear();
      previewTarget = '';
      previewContext = '';
      linkChoices = [];
      paintLinks();
      clearTimeout(draftTimer);
      pendingDraft = false;
    }
    if (changed || (!pendingDraft && (view.draftAck || 0) >= sequence)) {
      syncing = true;
      input.value = view.draft || '';
      syncing = false;
    }
    // eslint-disable-next-line max-len
    header.content = ` LINE${view.mode === 'demo' ? ' · DEMO' : ''}  ·  ${clean(view.account?.name)}  ${view.watching ? '● connected' : ''}`;
    pane.title = ` ${clean(view.chats.find((chat) => chat.id === view.selectedId)?.name || 'Messages')} `;
    paintChats();
    const key = JSON.stringify([view.selectedId, view.messages]);
    if (key !== messageKey) {
      messageKey = key;
      const previousId = messageRows[messageCursor]?.message.id;
      if (changed || !messageRows.length) openAtBottom = true;
      const following = messageCursor === messageRows.length - 1;
      for (const { row } of messageRows) row.destroyRecursively();
      messageCursor =
        changed || following
          ? Math.max(0, view.messages.length - 1)
          : Math.max(
              0,
              view.messages.findIndex((message) => message.id === previousId),
            );
      const messageTexts = view.messages.map((message) => {
        const sent = message.own && ['ok', 'sent', 'delivered'].includes(message.status);
        let tick = sent ? ' ✓' : '';
        if (message.own && message.read) tick = ' ✓✓';
        const sender = message.own ? 'You' : clean(message.sender);
        const heading = `${clean(message.day)} ${clean(message.time)}  ${sender}${tick}`;
        const text = clean(message.text || message.sticker?.alt || message.fileName || '[Attachment]');
        const bodyText = `${heading}${message.replyTo ? ' ↪ reply' : ''}\n${text}`;
        return bodyText;
      });
      messageRows = view.messages.map((message, index) => {
        const row = new Box(renderer, {
          id: `line-message-${index}`,
          backgroundColor: mode === 'history' && index === messageCursor ? '#182a20' : 'transparent',
          width: '100%',
          flexDirection: 'row',
          justifyContent: message.own ? 'flex-end' : 'flex-start',
          flexShrink: 0,
          marginBottom: 1,
        });
        const marker = new Text(renderer, {
          id: `line-message-marker-${index}`,
          height: 1,
          width: 2,
          flexShrink: 0,
          fg: green,
          content: mode === 'history' && index === messageCursor ? '›' : ' ',
        });
        const bodyText = messageTexts[index];
        row.add(marker);
        const content = new Box(renderer, {
          flexDirection: 'column',
          width: message.own ? 40 : Math.max(...bodyText.split('\n').map((line) => stringWidth(line))),
          maxWidth: '80%',
          flexShrink: 1,
          minWidth: 0,
        });
        content.add(
          new Text(renderer, {
            content: bodyText,
            fg: '#d8e5dd',
            width: '100%',
            flexShrink: 0,
          }),
        );
        const image = new Image(renderer, {
          id: `line-image-${index}`,
          width: '100%',
          height: 0,
          visible: false,
          fit: 'fit',
          protocol: 'auto',
          onError: () => {
            image.visible = false;
            image.height = 0;
          },
        });
        content.add(image);
        row.add(content);
        history.add(row);
        return { row, marker, message, image };
      });
      emptyMessages.visible = !messageRows.length;
      emptyMessages.content = 'No messages loaded.';
      if (changed) {
        history.scrollTo(history.scrollHeight);
        history.stickyScroll = true;
      }
    }
    syncImages();
    requestPreview();
    updateExpanded();
    const login = view.login || {};
    if (login.active) closeExpanded(false);
    loginImage.visible = Boolean(login.image && login.active);
    if (login.image && login.image !== imageSource) {
      imageSource = login.image;
      loginImage.source = login.image;
    }
    if (!login.active) {
      loginImage.source = undefined;
      imageSource = '';
    }
    loginText.visible = Boolean(login.active || login.canRetry);
    // eslint-disable-next-line max-len
    loginText.content = `${clean(login.statusText)}${login.pin ? `\nPIN: ${clean(login.pin)}` : ''}${login.canConfirm ? '\nCtrl+Y to confirm' : ''}\nCtrl+X cancel · Ctrl+L retry`;
    // eslint-disable-next-line max-len
    status.content = ` ${clean(view.statusText)}\n ${clean(view.sendNote || view.historyNote || '')}${view.sendStatus === 'pending' ? ' Sending…' : ''}`;
  };
  backend.on('state', onState);
  backend.on('failure', (message) => {
    failed = true;
    closeExpanded(false);
    status.content = clean(message);
    imageCache.clear();
    for (const { image } of messageRows) {
      image.source = undefined;
      image.visible = false;
    }
    loginImage.visible = false;
    loginImage.source = undefined;
    loginText.visible = false;
  });
  input.on(InputRenderableEvents.INPUT, () => {
    if (syncing || !view.selectedId || failed) return;
    pendingDraft = true;
    draftContext = context();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(flushDraft, 150);
  });
  input.on(InputRenderableEvents.ENTER, () => {
    if (
      mode !== 'insert' ||
      failed ||
      !input.value.trim() ||
      !view.selectedId ||
      view.busy ||
      view.sendStatus === 'pending' ||
      view.sendStatus === 'uncertain'
    ) {
      return;
    }
    flushDraft();
    backend.command({ action: 'send', ...context(), text: input.value });
  });
  renderer.keyInput.on('keypress', (key) => {
    const name =
      !key.ctrl &&
      !key.meta &&
      (mode !== 'insert' || expandedMessageId || linkChoices.length) &&
      /^[jkhl]$/i.test(key.name)
        ? key.name.toLowerCase()
        : key.name;
    if (
      (key.ctrl && ['c', 'r', 'l', 'y', 'x'].includes(name)) ||
      ['tab', 'escape', 'pageup', 'pagedown'].includes(name)
    ) {
      key.preventDefault?.();
    }
    if (key.ctrl && name === 'c') {
      renderer.destroy();
      return;
    }
    if (expandedMessageId) {
      key.preventDefault?.();
      if (name === 'escape' || (name === 'h' && !key.ctrl && !key.meta)) closeExpanded();
      if (!key.ctrl && !key.meta) {
        if (['j', 'down'].includes(name)) expandedScroll.scrollBy(1);
        if (['k', 'up'].includes(name)) expandedScroll.scrollBy(-1);
      }
      return;
    }
    if (linkChoices.length) {
      key.preventDefault?.();
      if (name === 'escape' || name === 'h') linkChoices = [];
      if (['j', 'down'].includes(name)) linkCursor = Math.min(linkChoices.length - 1, linkCursor + 1);
      if (['k', 'up'].includes(name)) linkCursor = Math.max(0, linkCursor - 1);
      if (['return', 'l'].includes(name) && linkChoices[linkCursor]) launchLink(linkChoices[linkCursor]);
      paintLinks();
      return;
    }
    if (mode !== 'insert' && !key.ctrl && !key.meta) {
      const lowerG = name === 'g' && !key.shift;
      const prefixed = prefixAt && Date.now() - prefixAt < 1000;
      const top = lowerG && prefixed;
      const bottom = name === 'G' || (name === 'g' && key.shift);
      prefixAt = lowerG && !top ? Date.now() : 0;
      if (top || bottom) {
        key.preventDefault?.();
        if (mode === 'history') {
          messageCursor = bottom ? Math.max(0, messageRows.length - 1) : 0;
          focus('history');
          history.scrollTo(bottom ? history.scrollHeight : 0);
        } else if (view.chats.length) {
          flushDraft();
          cursor = bottom ? view.chats.length - 1 : 0;
          backend.command({ action: 'select', id: view.chats[cursor].id });
          paintChats();
          revealChat();
        }
        return;
      }
    }
    if (key.ctrl && name === 'r') backend.command({ action: 'refresh' });
    if (key.ctrl && name === 'l') {
      backend.command({ action: view.login?.canRetry ? 'login-retry' : 'login', request: `tui-${Date.now()}` });
    }
    if (key.ctrl && name === 'y' && view.login?.canConfirm) {
      backend.command({ action: 'login-confirm', attempt: view.login.attempt });
    }
    if (key.ctrl && name === 'x') backend.command({ action: 'login-cancel' });
    if (name === 'tab') {
      flushDraft();
      focus(mode === 'chats' ? 'history' : 'chats');
      return;
    }
    if (name === 'escape') {
      flushDraft();
      focus('history');
      return;
    }
    if (mode === 'history' && key.ctrl && ['f', 'b', 'd', 'u'].includes(name)) {
      key.preventDefault?.();
      const fullPage = ['f', 'b'].includes(name);
      const page = Math.max(1, Math.floor(history.viewport.height / (fullPage ? 1 : 2)));
      const distance = ['f', 'd'].includes(name) ? page : -page;
      const selected = messageRows[messageCursor];
      if (selected) {
        const target = selected.row.y + distance;
        let closest = messageCursor;
        for (const [index, { row }] of messageRows.entries()) {
          if (Math.abs(row.y - target) < Math.abs(messageRows[closest].row.y - target)) closest = index;
        }
        messageCursor = closest;
        focus('history');
        history.scrollBy(distance);
      }
      return;
    }
    if (name === 'pageup') history.scrollBy(-10);
    if (name === 'pagedown') history.scrollBy(10);
    if (mode === 'insert' || key.ctrl || key.meta) return;
    if (name === 'h') {
      key.preventDefault?.();
      focus('chats');
      revealChat();
      return;
    }
    const delta = { j: 1, down: 1, k: -1, up: -1 }[name] || 0;
    if (delta && mode === 'history') {
      key.preventDefault?.();
      openAtBottom = false;
      const selected = messageRows[messageCursor];
      // Keep moving through a tall message before selecting its neighbour.
      if (selected) {
        const top = history.viewport.y;
        const bottom = top + history.viewport.height;
        if (delta > 0 && selected.row.y + selected.row.height > bottom) {
          history.scrollBy(1);
          return;
        }
        if (delta < 0 && selected.row.y < top) {
          history.scrollBy(-1);
          return;
        }
      }
      messageCursor = Math.max(0, Math.min(messageRows.length - 1, messageCursor + delta));
      focus('history');
      if (messageRows[messageCursor]) history.scrollChildIntoView(messageRows[messageCursor].row.id);
      return;
    }
    if (delta && view.chats.length) {
      flushDraft();
      cursor = Math.max(0, Math.min(view.chats.length - 1, cursor + delta));
      backend.command({ action: 'select', id: view.chats[cursor].id });
      paintChats();
      revealChat();
    }
    const selectedMessage = messageRows[messageCursor];
    if (name === 'l' && mode === 'history' && selectedMessage) {
      const links = linksIn([selectedMessage.message]);
      if (links.length) {
        key.preventDefault?.();
        linkChoices = links;
        linkCursor = 0;
        if (links.length === 1) launchLink(links[0]);
        else paintLinks();
        return;
      }
    }
    if (
      name === 'l' &&
      mode === 'history' &&
      selectedMessage &&
      (selectedMessage.message.contentType === 1 || selectedMessage.message.sticker || selectedMessage.image.source)
    ) {
      key.preventDefault?.();
      expandedMessageId = selectedMessage.message.id;
      expandedScroll.scrollTo(0);
      expandedView.visible = true;
      hints.content = ' IMAGE · h / Esc to return to conversation';
      requestPreview();
      updateExpanded();
      return;
    }
    if (name === 'return' || name === 'l' || name === 'i') {
      key.preventDefault?.();
      if (!view.selectedId && view.chats[cursor]) backend.command({ action: 'select', id: view.chats[cursor].id });
      if (mode === 'chats' && name !== 'i') {
        messageCursor = Math.max(0, messageRows.length - 1);
        openAtBottom = true;
        history.scrollTo(history.scrollHeight);
      }
      focus(name === 'i' ? 'insert' : 'history');
    }
  });
  return {
    onState,
    dispose: () => {
      clearTimeout(draftTimer);
      backend.close();
    },
    input,
  };
}

async function main(args) {
  const binary = resolveBackend(args);
  const { createCliRenderer } = await import('@opentui/core');
  let app;
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    openConsoleOnError: false,
    onDestroy: () => app?.dispose(),
  });
  try {
    // Build the UI before spawning so the initial state cannot be missed.
    const { EventEmitter } = require('node:events');
    const bridge = new EventEmitter();
    // eslint-disable-next-line no-use-before-define
    bridge.command = (command) => backend?.command(command);
    // eslint-disable-next-line no-use-before-define
    bridge.close = () => backend?.close();
    app = await createApp(renderer, bridge);
    const backend = new Backend(binary, args.includes('--demo') ? 'demo' : 'live');
    backend.on('state', (view) => bridge.emit('state', view));
    backend.on('failure', (message) => bridge.emit('failure', message));
  } catch (error) {
    renderer.destroy();
    throw error;
  }
}

module.exports = { main, createApp, clean };
