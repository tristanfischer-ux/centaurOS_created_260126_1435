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


if __name__ == "__main__":
    unittest.main()
