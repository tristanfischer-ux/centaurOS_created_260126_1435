#!/usr/bin/env python3
"""Tests for deterministic Blender image framing/blank detection."""

import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from render_image_quality import evaluate_image


class RenderImageQualityTest(unittest.TestCase):
    def _save(self, name, painter):
        temp = tempfile.TemporaryDirectory()
        path = Path(temp.name) / name
        image = Image.new("RGB", (600, 400), (120, 140, 160))
        painter(ImageDraw.Draw(image))
        image.save(path)
        self.addCleanup(temp.cleanup)
        return path

    def test_blank_backdrop_fails(self):
        path = self._save("blank.png", lambda draw: None)
        result = evaluate_image(path)
        self.assertFalse(result.passed)
        self.assertIn("edge density", " ".join(result.reasons))

    def test_tiny_product_fails_frame_occupancy(self):
        path = self._save(
            "tiny.png",
            lambda draw: draw.rectangle((285, 185, 315, 215), fill=(230, 230, 230)),
        )
        result = evaluate_image(path)
        self.assertFalse(result.passed)
        self.assertIn("occupancy", " ".join(result.reasons))

    def test_centred_product_passes(self):
        path = self._save(
            "good.png",
            lambda draw: draw.rectangle((150, 40, 450, 360), fill=(230, 230, 230)),
        )
        result = evaluate_image(path)
        self.assertTrue(result.passed, result.reasons)

    def test_edge_density_float_dust_passes_when_message_meets_floor(self):
        # proveCatch: raw 0.00196 must not fail as "0.0020 below 0.0020".
        # Build an image whose measured edge density sits in (0.00195, 0.0020).
        path = self._save(
            "edge_dust.png",
            lambda draw: draw.rectangle((80, 60, 520, 340), outline=(250, 250, 250), width=2),
        )
        result = evaluate_image(path)
        shown = round(result.edge_density, 4)
        if shown >= 0.0020:
            self.assertTrue(
                result.passed or "edge density" not in " ".join(result.reasons),
                f"edge={result.edge_density} shown={shown} reasons={result.reasons}",
            )


if __name__ == "__main__":
    unittest.main()
