"""Export official torchvision weights for local browser inference (no photo upload)."""
import hashlib
import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from faster_reference import FasterDetector, MODEL_NAME, WEIGHTS


class BrowserModel(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, image):
        result = self.model([image])[0]
        return result["boxes"], result["labels"], result["scores"]


def main():
    output = Path(".vision-data/faster-rcnn.onnx")
    detector = FasterDetector()
    model = BrowserModel(detector.model).eval()
    torch.onnx.export(model, (torch.zeros(3, 320, 320),), str(output),
                      input_names=["image"], output_names=["boxes", "labels", "scores"],
                      dynamic_axes={"image": {1: "height", 2: "width"},
                                    "boxes": {0: "detections"}, "labels": {0: "detections"},
                                    "scores": {0: "detections"}},
                      opset_version=17, dynamo=False, external_data=False)
    # Cloudflare static assets have a per-file limit. Keep each part under 20 MiB.
    directory = Path("public/models/faster-rcnn")
    directory.mkdir(parents=True, exist_ok=True)
    parts = []
    data = output.read_bytes()
    for index, offset in enumerate(range(0, len(data), 20 * 1024 * 1024)):
        block = data[offset:offset + 20 * 1024 * 1024]
        name = f"model-{index:02d}.bin"
        (directory / name).write_bytes(block)
        parts.append({"file": name, "bytes": len(block), "sha256": hashlib.sha256(block).hexdigest()})
    manifest = {"model": MODEL_NAME, "weights": WEIGHTS.name, "weightsUrl": WEIGHTS.url,
                "format": "onnx", "opset": 17, "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(), "parts": parts,
                "input": "float32 RGB CHW in [0,1]; normalization and resizing are in the graph",
                "outputs": ["boxes xyxy pixels", "labels COCO category IDs", "scores"],
                "exportTorch": torch.__version__}
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest), flush=True)


if __name__ == "__main__":
    main()
