package gui

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"sync"
	"testing"
)

func TestTUIStickerCacheKeepsLoadingAfterMultiplePacks(t *testing.T) {
	pixels, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(demoSage, "data:image/png;base64,"))
	if err != nil {
		t.Fatal(err)
	}
	pixels = append(pixels, make([]byte, 48000-len(pixels))...)
	data := "data:image/png;base64," + base64.StdEncoding.EncodeToString(pixels)
	fetched := map[string]int{}
	var fetchMu sync.Mutex
	e := NewEngine(Operations{FetchSticker: func(_ context.Context, s Sticker) string {
		fetchMu.Lock()
		fetched[s.ID]++
		fetchMu.Unlock()
		return data
	}}, nil)
	defer e.Close()
	e.state.SelectedID = "chat"
	e.state.Stickers.Open = true
	e.state.Stickers.Status = "ready"
	ctx := Command{ID: "chat", Session: e.state.Session, Selection: e.state.Selection}
	load := func(pack int) {
		e.mu.Lock()
		e.state.Stickers.PackageID = fmt.Sprint(pack)
		e.state.Stickers.Items = nil
		count := 8
		if pack == 4 {
			count = 24
		}
		for i := 0; i < count; i++ {
			e.state.Stickers.Items = append(e.state.Stickers.Items, Sticker{ID: fmt.Sprint(pack*1000 + i), PackageID: fmt.Sprint(pack)})
		}
		c := ctx
		c.PackageID, c.StickerID = fmt.Sprint(pack), fmt.Sprint(pack*1000)
		e.previewSticker(c)
		e.syncStickerImages()
		e.mu.Unlock()
		e.Wait()
		if e.View().StickerImages[c.StickerID] == "" {
			t.Fatalf("preview missing for pack %d", pack)
		}
		bytes := 2
		for key, value := range e.View().StickerImages {
			bytes += imageCost(key, value)
		}
		if bytes > stickerCacheBudget {
			t.Fatal("wire image cache exceeded budget", bytes)
		}
		bytes = 2
		for key, value := range e.stickerData {
			bytes += imageCost(key, value)
		}
		if bytes > stickerCacheBudget {
			t.Fatal("decoded cache exceeded budget", bytes)
		}
	}
	load(1)
	load(2)
	load(3)
	if e.stickerData["1000"] != "" {
		t.Fatal("old pack was not evicted")
	}
	load(1)
	if fetched["1000"] != 2 {
		t.Fatal("return to an evicted pack did not load")
	}
	load(4)
	var missing *Sticker
	for _, s := range e.state.Stickers.Items {
		if e.stickerData[s.ID] == "" {
			copy := s
			missing = &copy
			break
		}
	}
	if missing == nil {
		t.Fatal("large pack did not exercise eviction")
	}
	e.mu.Lock()
	c := ctx
	c.PackageID, c.StickerID = missing.PackageID, missing.ID
	e.previewSticker(c)
	e.syncStickerImages()
	e.mu.Unlock()
	e.Wait()
	if e.View().StickerImages[missing.ID] == "" || fetched[missing.ID] != 2 {
		t.Fatal("hovering an evicted sticker within a large pack did not reload it")
	}
}

func TestTUIStickerPreviewRejectsStaleContextAndUnknownItems(t *testing.T) {
	e := NewEngine(Operations{}, nil)
	defer e.Close()
	e.state.SelectedID = "chat"
	e.state.Stickers.Open = true
	e.state.Stickers.PackageID = "1"
	e.state.Stickers.Items = []Sticker{{ID: "1001", PackageID: "1"}}
	c := Command{ID: "other", Session: e.state.Session, Selection: e.state.Selection, PackageID: "1", StickerID: "1001"}
	e.previewSticker(c)
	if e.stickerPreview != nil {
		t.Fatal("stale context accepted")
	}
	c.ID, c.StickerID = "chat", "9999"
	e.previewSticker(c)
	if e.stickerPreview != nil {
		t.Fatal("unowned page item accepted")
	}
}
