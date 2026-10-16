"""Evaluate real Faster R-CNN on the same crops as the browser COCO benchmark."""
import hashlib
import json
import math
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter

from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from faster_reference import FasterDetector, MODEL_NAME, WEIGHTS
import torch
import torchvision


def main():
    manifest_path = Path(sys.argv[1]).resolve()
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    started = perf_counter()
    detector = FasterDetector()
    load_ms = round((perf_counter() - started) * 1000)
    cases = []
    for case in manifest["cases"]:
        source = manifest_path.parent / case["file"]
        if hashlib.sha256(source.read_bytes()).hexdigest() != case["sourceSha256"]:
            raise ValueError(f"Source hash mismatch: {case['id']}")
        with Image.open(source) as original:
            image = ImageOps.exif_transpose(original).convert("RGB")
        scale = min(1, 1920 / max(image.size))
        width, height = [max(1, math.floor(value * scale + .5)) for value in image.size]
        image = image.resize((width, height), Image.Resampling.BILINEAR)
        if case.get("crop"):
            x, y, w, h = case["crop"]
            target = (max(1, math.floor(width * w + .5)), max(1, math.floor(height * h + .5)))
            image = image.transform(target, Image.Transform.EXTENT,
                                    (width*x, height*y, width*(x+w), height*(y+h)), Image.Resampling.BILINEAR)
        result = detector.detect(image)
        for prediction in result["predictions"]:
            prediction["bbox"] = [value / (result["width"] if i % 2 == 0 else result["height"])
                                  for i, value in enumerate(prediction["bbox"])]
        cases.append({"id": case["id"], "sourceSha256": case["sourceSha256"],
                      "crop": case.get("crop"), "expected": case["expected"], **result})
        print(json.dumps({"case": case["id"], "inferenceMs": result["inferenceMs"],
                          "detections": len(result["predictions"])}), flush=True)
    checkpoint = Path(torch.hub.get_dir()) / "checkpoints" / Path(WEIGHTS.url).name
    report = {"at": datetime.now(timezone.utc).isoformat(), "kind": "exploratory-development-benchmark",
              "model": MODEL_NAME, "weights": WEIGHTS.name, "weightsUrl": WEIGHTS.url,
              "weightsSha256": hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
              "weightsBytes": checkpoint.stat().st_size, "torch": torch.__version__,
              "torchvision": torchvision.__version__, "device": "cpu", "threads": torch.get_num_threads(),
              "python": platform.python_version(), "manifestSha256": hashlib.sha256(manifest_bytes).hexdigest(),
              "preprocessing": "EXIF transpose, max dimension 1920, bilinear resize then normalized crop; PIL interpolation differs from browser canvas",
              "dataset": manifest["dataset"], "loadMs": load_ms, "cases": cases}
    output = Path("test-results/faster-benchmark.json")
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
