import { useEffect, useRef } from "react";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import * as faceMesh from "@mediapipe/face_mesh";
import { TRIANGULATION } from "./triangulation.js";
import { distance, drawPath, getCoordinate } from "./helpers.js";
import { FaceDetector } from "@tensorflow-models/face-detection";
import { GlassesImage } from "./glassesImage";


export const App = () => {
  const image = new Image();
  image.src = GlassesImage;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const initCam = () => {
    navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
      if (canvasRef.current) {
        canvasRef.current.width = 640;
        canvasRef.current.height = 480;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    });
  };

  const render = (detector) => {
    const showMask = true;
    const showContour = false;
    const showKeypoints = false;
    const showTriangulation = false;
    const showBoundingBox = false;
    const showEyes = false;
    const showImage = true;

    if (canvasRef.current && videoRef.current) {
      const ctx = canvasRef.current.getContext("2d");

      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 640, 480);
        if (detector) {
          detector
            .estimateFaces(videoRef.current, { flipHorizontal: false })
            .then((faces) => {
              faces.forEach((face) => {
                const keypoints = face.keypoints.map((keypoint) => [
                  keypoint.x,
                  keypoint.y,
                ]);
                const NUM_KEYPOINTS = 468;
                const NUM_IRIS_KEYPOINTS = 5;

                // DRAW MASK
                if (showMask) {
                  const partName = [
                    "overhead",
                    "rightCheek",
                    "chin",
                    "leftCheek",
                  ];
                  const overheadIndex = 0;
                  const chinIndex = 2;
                  const leftCheekIndex = 3;
                  const rightCheekIndex = 1;
                  const dots = [];
                  const maskKeyPointIndexs = [10, 234, 152, 454];

                  for (let i = 0; i < maskKeyPointIndexs.length; i++) {
                    const coordinate = getCoordinate(
                      canvasRef.current,
                      keypoints[maskKeyPointIndexs[i]][0],
                      keypoints[maskKeyPointIndexs[i]][1]
                    );
                    const dot = [coordinate[0], coordinate[1]];
                    dots.push(dot);
                  }

                  const maskCoordinate = [
                    dots[rightCheekIndex][0],
                    dots[overheadIndex][1],
                  ];

                  const maskHeight =
                    dots[chinIndex][1] - dots[overheadIndex][1];
                  const maskWidth =
                    dots[leftCheekIndex][0] - dots[rightCheekIndex][0];

                  ctx.fillStyle = "green";
                  dots.forEach((dot, i) => {
                    ctx.beginPath();
                    ctx.arc(dot[0], dot[1], 2, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.fillText(
                      `(${Math.floor(dot[0])}, ${Math.floor(dot[1])}) - ${
                        partName[i]
                      }`,
                      dot[0],
                      dot[1] - 10
                    );
                  });

                  ctx.drawImage(
                    image,
                    maskCoordinate[0],
                    maskCoordinate[1] + 20,
                    maskWidth,
                    100
                  );
                }

                // DRAW CONTOURS
                if (showContour) {
                  const contours =
                    faceLandmarksDetection.util.getKeypointIndexByContour(
                      faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh
                    );
                  for (const [label, contour] of Object.entries(contours)) {
                    ctx.strokeStyle = "blue";
                    ctx.lineWidth = 3;
                    ctx.fillStyle = "red";
                    const path = contour.map((index) => keypoints[index]);
                    if (path.every((value) => value != undefined)) {
                      drawPath(ctx, path, false);
                      ctx.fillText(label, path[0][0], path[0][1]);
                    }
                  }
                }

                // DRAW KEYPOINTS
                if (showKeypoints) {
                  ctx.fillStyle = "green";

                  for (let i = 0; i < NUM_KEYPOINTS; i++) {
                    const x = keypoints[i][0];
                    const y = keypoints[i][1];

                    ctx.beginPath();
                    ctx.arc(x, y, 1, 0, 2 * Math.PI);
                    ctx.fill();
                  }
                }

                //DRAW TRIANGULATION
                if (showTriangulation) {
                  ctx.strokeStyle = "green";
                  ctx.lineWidth = 0.5;
                  for (let i = 0; i < TRIANGULATION.length / 3; i++) {
                    const points = [
                      TRIANGULATION[i * 3],
                      TRIANGULATION[i * 3 + 1],
                      TRIANGULATION[i * 3 + 2],
                    ].map((index) => keypoints[index]);

                    drawPath(ctx, points, true);
                  }
                }

                // DRAW BOUNDING BOX
                if (showBoundingBox) {
                  ctx.strokeStyle = "red";
                  ctx.lineWidth = 1;

                  const box = faces[0].box;
                  drawPath(
                    ctx,
                    [
                      [box.xMin, box.yMin],
                      [box.xMax, box.yMin],
                      [box.xMax, box.yMax],
                      [box.xMin, box.yMax],
                    ],
                    true
                  );
                }

                // DRAW EYES
                if (showEyes) {
                  if (keypoints.length > NUM_KEYPOINTS) {
                    ctx.strokeStyle = "red";
                    ctx.lineWidth = 1;
                    const leftCenter = keypoints[NUM_KEYPOINTS];
                    const leftDiameterY = distance(
                      keypoints[NUM_KEYPOINTS + 4],
                      keypoints[NUM_KEYPOINTS + 2]
                    );
                    const leftDiameterX = distance(
                      keypoints[NUM_KEYPOINTS + 3],
                      keypoints[NUM_KEYPOINTS + 1]
                    );

                    ctx.beginPath();
                    ctx.ellipse(
                      leftCenter[0],
                      leftCenter[1],
                      leftDiameterX / 2,
                      leftDiameterY / 2,
                      0,
                      0,
                      2 * Math.PI
                    );
                    ctx.stroke();

                    if (keypoints.length > NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS) {
                      const rightCenter =
                        keypoints[NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS];
                      const rightDiameterY = distance(
                        keypoints[NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS + 2],
                        keypoints[NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS + 4]
                      );
                      const rightDiameterX = distance(
                        keypoints[NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS + 3],
                        keypoints[NUM_KEYPOINTS + NUM_IRIS_KEYPOINTS + 1]
                      );

                      ctx.beginPath();
                      ctx.ellipse(
                        rightCenter[0],
                        rightCenter[1],
                        rightDiameterX / 2,
                        rightDiameterY / 2,
                        0,
                        0,
                        2 * Math.PI
                      );
                      ctx.stroke();
                    }
                  }
                }
              });
            });
        }

        // DRAW CAMERA IMAGE TO CANVAS
        if(showImage){
          ctx.drawImage(videoRef.current, 0, 0, 640, 480);
        }
      }
    }
  };

  const initTensor = (cb: (detector: FaceDetector) => void) => {
    faceLandmarksDetection
      .createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: "mediapipe",
          refineLandmarks: true,
          maxFaces: 2,
          solutionPath: `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${faceMesh.VERSION}`,
        }
      )
      .then((detectorInstance) => {
        cb(detectorInstance);
      });
  };

  const handleSaveImage = () => {
    const image = canvasRef.current?.toDataURL("image/jpeg");
    if(imageRef.current && image) {
      // Update preview
      imageRef.current.src = image;

      // Send to API
      fetch("https://9e713737-7c73-49b4-bee4-45cc60028660.mock.pstmn.io", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imgBase64: image,
        }),
      });
    }
  };

  useEffect(() => {
    initCam();

    const handlePlaying = () => {
      initTensor((detector) => {
        // Render loop
        setInterval(() => render(detector), 1000 / 10); // 30fps // TODO: Should be requestAnimationFrame for optimal performance
      });
    };

    videoRef.current?.addEventListener("playing", handlePlaying);
    return () => {
      videoRef.current?.removeEventListener("playing", handlePlaying);
    };
  }, []);

  return (
    <div>
      <canvas id="output" ref={canvasRef}></canvas>
      <video
        id="video"
        autoPlay
        ref={videoRef}
        style={{ display: "none" }}
      />
      <img ref={imageRef} />
      
      <div>
        <button onClick={handleSaveImage}>Save image</button>
      </div>
    </div>
  );
};
