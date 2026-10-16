export const MODEL = Object.freeze({
  name: 'COCO-SSD',
  base: 'lite_mobilenet_v2',
  url: 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json',
  runtime: 'TensorFlow.js 4.22.0',
  minimumScore: 0.2,
  maximumDetections: 100,
  iouThreshold: 0.5,
  // COCO uses sparse category IDs. The graph score index is category ID - 1.
  classes: Object.freeze([
    { id: 'chair', class: 'chair', scoreIndex: 61 },
    { id: 'table', class: 'dining table', scoreIndex: 66 },
    { id: 'screen', class: 'tv', scoreIndex: 71 },
    { id: 'laptop', class: 'laptop', scoreIndex: 72 },
  ]),
});
