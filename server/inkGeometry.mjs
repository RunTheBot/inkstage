import polygonClipping from 'polygon-clipping';

// SVG's nonzero fill can paint overlapping loops in one outline solid.
// PowerPoint can leave white wedges in those self-crossing paths.
// Resolve the coverage into simple outer rings and holes before DrawingML.
export function flattenInkOutline(points) {
  if (points.length < 3) return [];
  return polygonClipping.union([points.map(point => [point.x, point.y])]);
}
