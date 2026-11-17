'use strict';

async function createStickerPicker(renderer, backend, { parent, getContext, getView, onClose }) {
  const { BoxRenderable: Box, TextRenderable: Text, ImageRenderable: Image } = await import('@opentui/core');
  // eslint-disable-next-line no-control-regex
  const clean = (value) => String(value ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
  const overlay = new Box(renderer, {
    id: 'line-sticker-picker',
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    backgroundColor: '#101714',
    zIndex: 12,
    visible: false,
  });
  const title = new Text(renderer, { fg: '#06c755', height: 2 });
  const body = new Box(renderer, {
    id: 'line-sticker-grid',
    flexGrow: 1,
    minHeight: 0,
    flexDirection: 'column',
    overflow: 'hidden',
  });
  const note = new Text(renderer, { id: 'line-sticker-note', fg: '#06c755', height: 3 });
  let cells = [];
  let gridKey = '';
  const thumbnails = new Map();
  const requested = new Set();
  const previewRetries = new Map();
  let retryTimer;
  let retryKey = '';
  overlay.add(title);
  overlay.add(body);
  overlay.add(note);
  parent.add(overlay);
  let active = false;
  let cursor = 0;
  let pageKey = '';
  let sending = false;
  let scope = '';
  let previewRequest = '';
  const command = (action, extra = {}) => backend.command({ action, ...getContext(), ...extra });
  const dismiss = () => {
    active = false;
    clearTimeout(retryTimer);
    retryTimer = undefined;
    previewRetries.clear();
    sending = false;
    overlay.visible = false;
    for (const cell of cells) cell.image.source = undefined;
    thumbnails.clear();
    requested.clear();
    onClose();
  };
  const paint = () => {
    if (!active) return;
    const view = getView();
    const catalog = view.stickers || {};
    const key = `${catalog.packageId}:${catalog.page}`;
    if (key !== pageKey) {
      cursor = 0;
      pageKey = key;
    }
    const items = catalog.items || [];
    cursor = Math.max(0, Math.min(cursor, items.length - 1));
    const pack = catalog.products?.find((product) => product.id === catalog.packageId);
    const packPosition = `${(catalog.products || []).indexOf(pack) + 1}/${catalog.products?.length || 0}`;
    const pagePosition = `${(catalog.page || 0) + 1}/${catalog.pages || 0}`;
    const packs = catalog.products || [];
    const packIndex = packs.indexOf(pack);
    const pagesInPack = (product) =>
      product.id === catalog.packageId
        ? Math.max(1, catalog.pages || 0)
        : Math.max(1, Math.ceil((product.count || 0) / 40));
    const totalPages = packs.reduce((sum, product) => sum + pagesInPack(product), 0);
    const globalPage =
      packs.slice(0, packIndex).reduce((sum, product) => sum + pagesInPack(product), 0) + (catalog.page || 0) + 1;
    const pageLabel = `第 ${globalPage}/${totalPages} 頁（本包 ${pagePosition} 頁）`;
    title.content = ` 貼圖 · ${clean(pack?.name || '我的貼圖')}\n 貼圖包 ${packPosition} · ${pageLabel}`;
    const selected = catalog.selected || items[cursor];
    const imageKey = selected ? `${selected.id}${selected.hash ? `-${selected.hash}` : ''}` : '';
    const requestKey = selected ? `${scope}:${catalog.packageId}:${catalog.page}:${imageKey}` : '';
    const gridItems = catalog.selected ? [catalog.selected] : items;
    const rowCount = Math.ceil(gridItems.length / 4);
    const visibleRows = Math.max(1, Math.floor(body.height / 7));
    const firstRow = catalog.selected ? 0 : Math.max(0, Math.floor(cursor / 4) - visibleRows + 1);
    const start = firstRow * 4;
    const end = Math.min(gridItems.length, start + visibleRows * 4);
    const nextGridKey = `${scope}:${key}:${catalog.selected?.id || ''}:${start}:${end}`;
    if (nextGridKey !== gridKey) {
      gridKey = nextGridKey;
      previewRequest = '';
      for (const child of body.getChildren()) child.destroyRecursively();
      cells = [];
      const visibleKeys = new Set(
        gridItems.slice(start, end).map((item) => `${item.id}${item.hash ? `-${item.hash}` : ''}`),
      );
      for (const key of thumbnails.keys()) {
        if (!visibleKeys.has(key)) thumbnails.delete(key);
      }
      requested.clear();
      for (let rowIndex = firstRow; rowIndex < Math.min(rowCount, firstRow + visibleRows); rowIndex++) {
        const row = new Box(renderer, { height: 7, flexShrink: 0, flexDirection: 'row' });
        for (let column = 0; column < 4; column++) {
          const index = rowIndex * 4 + column;
          const item = gridItems[index];
          const card = new Box(renderer, {
            id: `line-sticker-cell-${index}`,
            width: '25%',
            minWidth: 0,
            height: 7,
            border: Boolean(item),
            flexDirection: 'column',
            borderColor: '#385044',
          });
          row.add(card);
          if (!item) continue;
          const image = new Image(renderer, {
            id: `line-sticker-preview-${index}`,
            width: '100%',
            flexGrow: 1,
            minHeight: 0,
            fit: 'fit',
            protocol: 'auto',
          });
          const label = new Text(renderer, { height: 1, fg: '#d8e5dd', wrapMode: 'none' });
          card.add(image);
          card.add(label);
          cells.push({ card, image, label, item, index });
        }
        body.add(row);
      }
    }
    for (const cell of cells) {
      const key = `${cell.item.id}${cell.item.hash ? `-${cell.item.hash}` : ''}`;
      const data = view.stickerImages?.[key];
      if (typeof data === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) {
        thumbnails.set(key, data);
      }
      const source = thumbnails.get(key);
      if (cell.image.source !== source) cell.image.source = source;
      const highlighted = Boolean(catalog.selected) || cell.index === cursor;
      cell.card.borderColor = highlighted ? '#06c755' : '#385044';
      cell.card.backgroundColor = highlighted ? '#20382a' : '#101714';
      cell.label.fg = '#d8e5dd';
      cell.label.content = `${highlighted ? '›' : ' '} ${cell.index + 1} · ${clean(cell.item.id)}`;
      if (!catalog.selected && !source && !requested.has(key)) {
        requested.add(key);
        command('sticker-preview', { packageId: cell.item.packageId, stickerId: cell.item.id });
      }
    }
    if (requestKey && requestKey !== previewRequest && !catalog.selected) {
      previewRequest = requestKey;
      command('sticker-preview', { packageId: selected.packageId, stickerId: selected.id });
    }
    const source = thumbnails.get(imageKey);
    if (source || retryKey !== requestKey) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
    retryKey = requestKey;
    const retries = previewRetries.get(requestKey) || 0;
    if (!source && selected && !catalog.selected && catalog.status === 'ready' && retries < 3 && !retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        if (!active) return;
        previewRetries.set(requestKey, retries + 1);
        previewRequest = '';
        paint();
      }, 1500);
    }
    if (catalog.status === 'loading') {
      note.content = ' 正在載入我的貼圖… · Esc 取消';
    } else if (catalog.status === 'error') {
      note.content = ` ${clean(catalog.note)}\n r 重試 · Esc 返回`;
    } else if (sending) {
      note.content = ` ${view.sendStatus === 'uncertain' ? clean(view.sendNote) : '正在傳送貼圖…'}`;
    } else if (catalog.selected) {
      note.content = view.draft ? ' 已保留文字草稿，請先清空草稿再傳送貼圖。\n Esc 返回' : ' Enter 傳送貼圖 · Esc 取消';
    } else {
      let detail = clean(catalog.note || '沒有可用的貼圖');
      if (items.length) {
        detail = source ? '靜態預覽，不含音效' : '正在載入貼圖預覽… · r 重新載入';
        if (!source && retries >= 3) detail = '貼圖預覽載入失敗 · r 重試 · 可繼續選取貼圖';
      }
      note.content = ` hjkl 移動 · [/] 貼圖包 · n/p 翻頁 · Enter 選取 · Esc 返回\n ${detail}`;
    }
  };
  body.onSizeChange = paint;
  return {
    get active() {
      return active;
    },
    open() {
      const view = getView();
      if (
        !view.selectedId ||
        view.status !== 'ready' ||
        view.busy ||
        ['pending', 'uncertain'].includes(view.sendStatus)
      ) {
        return;
      }
      active = true;
      sending = false;
      cursor = 0;
      scope = JSON.stringify(getContext());
      previewRequest = '';
      requested.clear();
      overlay.visible = true;
      command('sticker-open');
      paint();
    },
    update() {
      if (!active) return;
      if (scope !== JSON.stringify(getContext()) || getView().login?.active) {
        dismiss();
        return;
      }
      if (sending && !getView().stickers?.selected && getView().sendStatus === 'idle') {
        dismiss();
        return;
      }
      paint();
    },
    dismiss,
    dispose() {
      active = false;
      clearTimeout(retryTimer);
    },
    handleKey(key) {
      if (!active) return;
      const name = key.name.toLowerCase();
      const view = getView();
      const catalog = view.stickers || {};
      if (name === 'escape') {
        if (sending && view.sendStatus === 'pending') return;
        command('sticker-close');
        dismiss();
        return;
      }
      if (key.ctrl || key.meta || sending) return;
      if (name === 'r' && catalog.status === 'error') {
        command('sticker-open');
        return;
      }
      if (name === 'r' && catalog.status === 'ready') {
        previewRetries.clear();
        previewRequest = '';
        paint();
        return;
      }
      if (catalog.status !== 'ready') return;
      if (catalog.selected) {
        if (name === 'return' && !view.draft && !view.busy && !['pending', 'uncertain'].includes(view.sendStatus)) {
          sending = true;
          command('sticker-send', {
            packageId: catalog.selected.packageId,
            stickerId: catalog.selected.id,
            replyTo: view.reply?.id || '',
          });
          paint();
        }
        return;
      }
      const count = catalog.items?.length || 0;
      if (['l', 'right'].includes(name) && cursor % 4 < 3 && cursor + 1 < count) cursor++;
      if (['h', 'left'].includes(name) && cursor % 4 > 0) cursor--;
      if (['j', 'down'].includes(name) && Math.floor(cursor / 4) < Math.floor((count - 1) / 4)) {
        cursor = Math.min(count - 1, cursor + 4);
      }
      if (['k', 'up'].includes(name) && cursor >= 4) cursor -= 4;
      if (['[', ']'].includes(name)) {
        const packs = catalog.products || [];
        const index = packs.findIndex((pack) => pack.id === catalog.packageId);
        const pack = packs[index + (name === ']' ? 1 : -1)];
        if (pack) command('sticker-page', { packageId: pack.id, page: 0 });
      }
      if (['n', 'p'].includes(name)) {
        const page = (catalog.page || 0) + (name === 'n' ? 1 : -1);
        if (page >= 0 && page < catalog.pages) {
          command('sticker-page', { packageId: catalog.packageId, page });
        } else {
          const packs = catalog.products || [];
          const index = packs.findIndex((pack) => pack.id === catalog.packageId);
          const pack = packs[index + (name === 'n' ? 1 : -1)];
          if (pack) {
            command('sticker-page', {
              packageId: pack.id,
              page: name === 'n' ? 0 : Math.max(0, Math.ceil((pack.count || 0) / 40) - 1),
            });
          }
        }
      }
      if (name === 'return' && catalog.items?.[cursor]) {
        const item = catalog.items[cursor];
        command('sticker-choose', { packageId: item.packageId, stickerId: item.id });
      }
      paint();
    },
  };
}

module.exports = { createStickerPicker };
