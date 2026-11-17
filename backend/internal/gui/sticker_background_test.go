package gui

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"strings"
	"testing"
)

func TestStickerPreviewCompositesTransparencyOntoWhite(t *testing.T) {
	source := image.NewNRGBA(image.Rect(0, 0, 3, 1))
	source.SetNRGBA(1, 0, color.NRGBA{R: 255, A: 128})
	source.SetNRGBA(2, 0, color.NRGBA{B: 255, A: 255})
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, source); err != nil {
		t.Fatal(err)
	}
	result := opaqueStickerPreview("data:image/png;base64," + base64.StdEncoding.EncodeToString(encoded.Bytes()))
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(result, "data:image/png;base64,"))
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := png.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	want := []color.NRGBA{{255, 255, 255, 255}, {255, 127, 127, 255}, {0, 0, 255, 255}}
	for x, expected := range want {
		actual := color.NRGBAModel.Convert(decoded.At(x, 0)).(color.NRGBA)
		if actual != expected {
			t.Fatalf("pixel %d: got %v, want %v", x, actual, expected)
		}
	}
}
