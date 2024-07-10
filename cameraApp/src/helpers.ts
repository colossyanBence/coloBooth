export const drawPath = (ctx, points, closePath) => {
  const region = new Path2D();
  region.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    region.lineTo(point[0], point[1]);
  }

  if (closePath) {
    region.closePath();
  }
  ctx.stroke(region);
};

export const distance = (a, b) => {
  return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));
};

export const getCoordinate = (canvas,x,y) => {
  const ratio = canvas.clientHeight/canvas.height;
  const resizeX = x*ratio;
  const resizeY = y*ratio;
  return [resizeX, resizeY];
}