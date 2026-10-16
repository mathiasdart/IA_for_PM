/** Synthetic GraphModel for integration tests only; never a vision benchmark. */
export function equipmentGraph() {
  const scoreShape = [1, 2, 90];
  const boxShape = [1, 2, 1, 4];
  const scores = new Float32Array(180);
  scores[61] = 0.9;
  scores[90 + 72] = 0.8;
  const boxes = new Float32Array([0.1, 0.1, 0.6, 0.4, 0.3, 0.5, 0.8, 0.9]);
  const values = new Float32Array(scores.length + boxes.length);
  values.set(scores); values.set(boxes, scores.length);
  const shape = (dimensions) => ({ dim: dimensions.map((size) => ({ size: String(size) })) });
  const constant = (name, dimensions) => ({ name, op: 'Const', attr: {
    dtype: { type: 'DT_FLOAT' }, value: { tensor: { dtype: 'DT_FLOAT', tensorShape: shape(dimensions) } },
  } });
  return {
    manifest: {
      format: 'graph-model', generatedBy: 'EPITA synthetic integration test', convertedBy: 'test fixture',
      modelTopology: { node: [
        { name: 'image_tensor', op: 'Placeholder', attr: { dtype: { type: 'DT_INT32' }, shape: { shape: shape([1, -1, -1, 3]) } } },
        constant('score_weights', scoreShape), constant('box_weights', boxShape),
        { name: 'scores', op: 'Identity', input: ['score_weights'], attr: { T: { type: 'DT_FLOAT' } } },
        { name: 'boxes', op: 'Identity', input: ['box_weights'], attr: { T: { type: 'DT_FLOAT' } } },
      ], versions: { producer: 1 } },
      signature: {
        inputs: { image_tensor: { name: 'image_tensor:0', dtype: 'DT_INT32', tensorShape: shape([1, -1, -1, 3]) } },
        outputs: {
          scores: { name: 'scores:0', dtype: 'DT_FLOAT', tensorShape: shape(scoreShape) },
          boxes: { name: 'boxes:0', dtype: 'DT_FLOAT', tensorShape: shape(boxShape) },
        },
      },
      weightsManifest: [{ paths: ['test-weights.bin'], weights: [
        { name: 'score_weights', shape: scoreShape, dtype: 'float32' },
        { name: 'box_weights', shape: boxShape, dtype: 'float32' },
      ] }],
    },
    weights: Buffer.from(values.buffer),
  };
}
