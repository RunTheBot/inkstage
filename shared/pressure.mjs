import { getStroke } from 'perfect-freehand';

function pressureSamples(stroke, aspect) {
  const height = 1600 / aspect;
  const samples = [];
  const spacing = Math.max(.06, Math.min(.2, stroke.width * .08));
  for (const p of stroke.points) {
    const point = { x: p.x * 1600, y: p.y * height, pressure: p.pressure ?? .5 };
    const last = samples[samples.length - 1];
    if (last && point.x === last.x && point.y === last.y) last.pressure = Math.max(last.pressure, point.pressure);
    else samples.push(point);
  }
  // Smooth width over a small spatial distance in both directions. This
  // removes sensor ripples without making the drawn position trail the tip.
  // Distance weighting avoids giving repeated stationary samples extra weight.
  const distance = Math.max(.35, Math.min(1, stroke.width * .2));
  const forward = [];
  for (let i = 0; i < samples.length; i++) {
    const current = samples[i], previous = samples[i - 1];
    const alpha = previous ? -Math.expm1(-Math.hypot(current.x - previous.x, current.y - previous.y) / distance) : 1;
    forward.push(i ? forward[i - 1] + alpha * (current.pressure - forward[i - 1]) : current.pressure);
  }
  let backward = samples[samples.length - 1]?.pressure ?? .5;
  for (let i = samples.length - 1; i >= 0; i--) {
    const current = samples[i], next = samples[i + 1];
    if (next) {
      const alpha = -Math.expm1(-Math.hypot(next.x - current.x, next.y - current.y) / distance);
      backward += alpha * (current.pressure - backward);
    }
    current.pressure = (forward[i] + backward) / 2;
  }
  // Filter pressure before thinning positions, so high-frequency pressure
  // noise cannot alias into alternating thick and thin patches.
  const kept = [];
  for (const point of samples) {
    const last = kept[kept.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= spacing) kept.push(point);
  }
  const end = samples[samples.length - 1];
  const last = kept[kept.length - 1];
  if (end && end !== last) {
    if (kept.length > 1 && Math.hypot(end.x - last.x, end.y - last.y) < spacing) kept[kept.length - 1] = end;
    else kept.push(end);
  }
  return kept;
}

// The same outline is used by the canvas and PPTX exporter.
export function pressureOutline(stroke, aspect) {
  if (!(stroke.sensitivity > 0) || !stroke.points.some(p => p.pressure !== undefined)) return null;
  const height = 1600 / aspect;
  // The library removes the last three coordinate units as endpoint noise.
  // At one slide pixel per unit that can erase most of a small letter. Use
  // finer units for both position and width so cleanup stays below 0.05 px.
  const precision = 64;
  const samples = pressureSamples(stroke, aspect).map(p => [p.x * precision, p.y * precision, p.pressure]);
  return getStroke(samples, {
    size: stroke.width * precision,
    thinning: stroke.sensitivity * .8,
    smoothing: .5,
    streamline: 0,
    simulatePressure: false,
    last: true,
  }).map(([x, y]) => ({ x: x / (1600 * precision), y: y / (height * precision) }));
}

// Dense stylus samples can reverse direction as pressure falls during lift-off.
// Cover the join with the actual brush disk: an outline that crosses itself at
// that turn can otherwise leave a fork or a tiny unpainted gap inside the tip.
// Keep disks separate from the outline so opposite winding cannot cancel ink.
export function pressureJoins(stroke, aspect) {
  if (!(stroke.sensitivity > 0) || !stroke.points.some(p => p.pressure !== undefined)) return [];
  const height = 1600 / aspect;
  const samples = pressureSamples(stroke, aspect);
  const joins = [];
  const lengths = [0];
  for (let i = 1; i < samples.length; i++) lengths.push(lengths[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y));
  const turnDistance = Math.max(.5, stroke.width * .5);
  let before = 0, after = 1;
  for (let i = 0; i < samples.length; i++) {
    const point = samples[i];
    while (before + 1 < i && lengths[i] - lengths[before + 1] >= turnDistance) before++;
    after = Math.max(after, i + 1);
    while (after < samples.length - 1 && lengths[after] - lengths[i] < turnDistance) after++;
    const previous = before < i ? samples[before] : undefined, next = samples[after];
    const reversal = previous && next && (point.x - previous.x) * (next.x - point.x) + (point.y - previous.y) * (next.y - point.y) < 0;
    if (i === 0 || i === samples.length - 1 || reversal) {
      const radius = Math.max(.01, stroke.width * (.5 - stroke.sensitivity * .8 * (.5 - point.pressure)));
      joins.push({ x: point.x / 1600, y: point.y / height, radius });
    }
  }
  return joins;
}
