package gui

import "sort"

const stickerCacheBudget = 1 << 20

func stickerCacheKey(s Sticker) string {
	if s.Hash != "" {
		return s.ID + "-" + s.Hash
	}
	return s.ID
}

func (e *Engine) activeStickerPreview() *Sticker {
	if e.stickerPreview == nil || !e.state.Stickers.Open {
		return nil
	}
	for _, s := range e.state.Stickers.Items {
		if stickerCacheKey(s) == stickerCacheKey(*e.stickerPreview) && s.PackageID == e.state.Stickers.PackageID {
			return e.stickerPreview
		}
	}
	return nil
}

func (e *Engine) clearStaleStickerLoads() {
	for key, generation := range e.stickerLoading {
		if generation != e.stickerGeneration+1 {
			delete(e.stickerLoading, key)
		}
	}
}

func (e *Engine) previewSticker(c Command) {
	if !e.current(c) || !e.state.Stickers.Open || c.PackageID != e.state.Stickers.PackageID {
		return
	}
	for _, s := range e.state.Stickers.Items {
		if s.ID != c.StickerID || s.PackageID != c.PackageID {
			continue
		}
		selected := s
		e.stickerPreview = &selected
		key := stickerCacheKey(s)
		if e.stickerData[key] == "" && e.stickerLoading[key] != e.stickerGeneration+1 {
			delete(e.stickerAttempted, key)
		}
		return
	}
}

func (e *Engine) cacheSticker(key, data string) {
	if e.state.StickerImages[key] == data && e.stickerData[key] == data {
		return
	}
	if imageCost(key, data)+2 > stickerCacheBudget {
		return
	}
	if e.stickerData == nil {
		e.stickerData = map[string]string{}
	}
	if e.state.StickerImages == nil {
		e.state.StickerImages = map[string]string{}
	}
	priority := map[string]int{}
	for _, s := range e.state.Stickers.Items {
		priority[stickerCacheKey(s)] = 1
	}
	if s := e.activeStickerPreview(); s != nil {
		priority[stickerCacheKey(*s)] = 2
	}
	if s := e.state.Stickers.Selected; s != nil {
		priority[stickerCacheKey(*s)] = 2
	}
	e.stickerData[key] = data
	e.state.StickerImages[key] = data
	total := 2
	keys := []string{}
	for k, value := range e.stickerData {
		total += imageCost(k, value)
		if k != key {
			keys = append(keys, k)
		}
	}
	sort.Slice(keys, func(i, j int) bool {
		if priority[keys[i]] != priority[keys[j]] {
			return priority[keys[i]] < priority[keys[j]]
		}
		return keys[i] < keys[j]
	})
	for _, k := range keys {
		if total <= stickerCacheBudget {
			break
		}
		total -= imageCost(k, e.stickerData[k])
		delete(e.stickerData, k)
		delete(e.state.StickerImages, k)
	}
}
