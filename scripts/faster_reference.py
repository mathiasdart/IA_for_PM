"""Real torchvision Faster R-CNN inference, for offline evaluation and ONNX export."""
from time import perf_counter

import torch
from PIL import Image
from torchvision.models.detection import (
    FasterRCNN_ResNet50_FPN_V2_Weights,
    fasterrcnn_resnet50_fpn_v2,
)
from torchvision.transforms.functional import pil_to_tensor

MODEL_NAME = "fasterrcnn_resnet50_fpn_v2"
WEIGHTS = FasterRCNN_ResNet50_FPN_V2_Weights.COCO_V1
CLASSES = {62: "chair", 67: "dining table", 72: "tv", 73: "laptop"}
MINIMUM_SCORE = 0.2


class FasterDetector:
    def __init__(self, threads=4):
        torch.set_num_threads(threads)
        self.model = fasterrcnn_resnet50_fpn_v2(weights=None, weights_backbone=None)
        # Official weights, with torchvision's published SHA-256 prefix check.
        self.model.load_state_dict(WEIGHTS.get_state_dict(progress=False, check_hash=True))
        self.model.eval()

    @torch.inference_mode()
    def detect(self, image: Image.Image):
        image = image.convert("RGB")
        width, height = image.size
        started = perf_counter()
        tensor = pil_to_tensor(image).float().div_(255)
        output = self.model([tensor])[0]
        predictions = []
        for box, score, label in zip(output["boxes"].tolist(), output["scores"].tolist(), output["labels"].tolist()):
            if label not in CLASSES or score < MINIMUM_SCORE:
                continue
            x1, y1, x2, y2 = box
            predictions.append({"class": CLASSES[label], "score": score,
                                "bbox": [x1, y1, x2 - x1, y2 - y1], "model": "faster-rcnn"})
        return {"predictions": predictions, "width": width, "height": height,
                "inferenceMs": round((perf_counter() - started) * 1000),
                "model": MODEL_NAME, "weights": WEIGHTS.name, "truncated": len(output["boxes"]) >= 100}
