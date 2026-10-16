"""Export authorized, annotated views into a COCO-format whiteboard dataset.

This prepares data only; it does not train a model or enable board detections.
Requires Pillow. Never writes images into the application or public directory.
"""
import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, ImageOps


def prepare(manifest_path, output_path):
    manifest = json.loads(manifest_path.read_text())
    splits = {name: {"images": [], "annotations": [], "categories": [{"id": 1, "name": "whiteboard"}]}
              for name in ["train", "validation", "test"]}
    groups = defaultdict(set)
    counts = Counter()
    reviewed = True
    for index, case in enumerate(manifest["cases"], 1):
        split = case["split"]
        if split not in splits or not case.get("group"):
            raise ValueError("Chaque vue doit définir split et group (salle/session indépendante).")
        groups[case["group"]].add(split)
        if len(groups[case["group"]]) > 1:
            raise ValueError("Une même salle/session ne peut figurer dans plusieurs partitions.")
        source = manifest_path.parent / case["file"]
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        if digest != case["sourceSha256"]:
            raise ValueError(f"Empreinte source incorrecte : {case['id']}")
        image = ImageOps.exif_transpose(Image.open(source)).convert("RGB")
        if case.get("crop"):
            x, y, w, h = case["crop"]
            if min(x, y) < 0 or min(w, h) <= 0 or x + w > 1 or y + h > 1:
                raise ValueError("Recadrage invalide.")
            image = image.crop((round(x * image.width), round(y * image.height),
                                round((x + w) * image.width), round((y + h) * image.height)))
        filename = f"{index:04d}.jpg"
        folder = output_path / split / "images"
        folder.mkdir(parents=True, exist_ok=True)
        image.save(folder / filename, quality=95)
        dataset = splits[split]
        dataset["images"].append({"id": index, "file_name": f"images/{filename}", "width": image.width,
                                  "height": image.height, "sourceSha256": digest, "sourceCase": case["id"],
                                  "group": case["group"]})
        for annotation in case["expected"]:
            if annotation["class"] != "whiteboard":
                raise ValueError("Cet export concerne uniquement la classe whiteboard.")
            x, y, w, h = annotation["bbox"]
            if min(x, y) < 0 or min(w, h) <= 0 or x + w > 1 or y + h > 1:
                raise ValueError("Annotation normalisée invalide.")
            bbox = [x * image.width, y * image.height, w * image.width, h * image.height]
            dataset["annotations"].append({"id": index * 1000 + len(dataset["annotations"]),
                                           "image_id": index, "category_id": 1, "bbox": bbox,
                                           "area": bbox[2] * bbox[3], "iscrowd": 0})
        counts[f"{split}_positive" if case["expected"] else f"{split}_negative"] += 1
        reviewed = reviewed and case.get("reviewed", False)
    output_path.mkdir(parents=True, exist_ok=True)
    for split, dataset in splits.items():
        folder = output_path / split
        folder.mkdir(exist_ok=True)
        (folder / "annotations.json").write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n")
    structural_ready = reviewed and all(counts[f"{split}_{kind}"] > 0
                                       for split in splits for kind in ["positive", "negative"])
    report = {"kind": "whiteboard-data-preparation-only", "trainingPerformed": False,
              "independentGroups": len(groups), "allAnnotationsReviewed": reviewed,
              "counts": dict(counts), "structurallyReadyForTraining": structural_ready,
              "generalizationValidated": False,
              "remaining": [] if structural_ready else ["Relire les annotations et constituer des partitions indépendantes train/validation/test, chacune avec des tableaux et des négatifs."]}
    (output_path / "readiness.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--require-ready", action="store_true")
    args = parser.parse_args()
    report = prepare(args.manifest.resolve(), args.output.resolve())
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.require_ready and not report["structurallyReadyForTraining"]:
        raise SystemExit(2)
