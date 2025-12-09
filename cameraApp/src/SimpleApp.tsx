import { useCallback, useEffect, useRef, useState } from "react";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import * as faceMesh from "@mediapipe/face_mesh";

const CAM_RES_WIDTH = 1280;
const CAM_RES_HEIGHT = 720;
const SCREEN_WIDTH = 1280;
const SCREEN_HEIGHT = 720;
const COUNTDOWN_INITIAL = 3;
const FLASH_DURATION = 100;
const COUNTDOWN_INTERVAL = 1000;
const WATERMARK_WIDTH = 220;
const WATERMARK_HEIGHT = 50;
const WATERMARK_X_OFFSET = 230;
const WATERMARK_Y_OFFSET = 10;
const UPLOAD_URL = "http://172.104.138.166:8000/upload";

interface Landmark {
  x: number;
  y: number;
  z?: number;
}

interface Face {
  keypoints: Landmark[];
}

type OverlayPositionType = "between" | "top" | "bottom";

interface FaceOverlayConfig {
  id: string;
  imageSrc: string;
  type: OverlayPositionType;
  // For "between" type: landmark indices for left and right positioning
  leftLandmarkIndices?: number[];
  rightLandmarkIndices?: number[];
  // For "top" type: landmark indices for top of head positioning
  topLandmarkIndices?: number[];
  // For "bottom" type: landmark indices for bottom of face positioning (e.g., top of mouth)
  bottomLandmarkIndices?: number[];
  // For "top" and "bottom" types: reference landmarks for width calculation (optional)
  widthReferenceIndices?: number[];
  // Scale multiplier based on distance between landmarks or reference width
  scale: number;
  // Vertical offset as percentage of height (negative = up, positive = down)
  yOffset: number;
  // Horizontal offset as percentage of width (negative = left, positive = right)
  xOffset?: number;
  // Rotation offset in radians (added to calculated roll)
  rotationOffset?: number;
  // Whether to flip horizontally
  flipHorizontal?: boolean;
}

// Face overlay configurations
const FACE_OVERLAYS: FaceOverlayConfig[] = [
  {
    id: "glasses",
    imageSrc: "glasses.png",
    type: "between",
    leftLandmarkIndices: [249, 33, 130],
    rightLandmarkIndices: [7, 263, 359],
    scale: 2,
    yOffset: -0.12,
    rotationOffset: Math.PI,
  },
  {
    id: "hat",
    imageSrc: "hat.png",
    type: "top",
    topLandmarkIndices: [10, 151, 9, 338], // Top of head landmarks
    widthReferenceIndices: [234, 454], // Left and right temple points for width
    scale: 1.5,
    yOffset: -0.5,
    rotationOffset: Math.PI, // Flip hat to correct orientation
  },
  {
    id: "beard",
    imageSrc: "beard.png",
    type: "bottom",
    bottomLandmarkIndices: [0, 13, 14], // Top of mouth/upper lip landmarks
    widthReferenceIndices: [172, 397], // Left and right mouth corners for width
    scale: 2,
    yOffset: 0.41,
    rotationOffset: Math.PI, // Flip beard to correct orientation
  },
];

const IMAGES_TO_LOAD = [
  ...FACE_OVERLAYS.map((overlay) => overlay.imageSrc),
  "logo.svg",
];

const preloadImages = (srcArray: string[]): Promise<HTMLImageElement[]> => {
  return Promise.all(
    srcArray.map(
      (src) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.src = src;
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Failed to load ${src}`));
        })
    )
  );
};

export const SimpleApp: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const detector = useRef<faceLandmarksDetection.FaceLandmarksDetector | null>(null);
  const loadedImagesRef = useRef<HTMLImageElement[]>([]);
  const countRef = useRef(COUNTDOWN_INITIAL);

  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [isCountback, setIsCountback] = useState(false);
  const [displayCount, setDisplayCount] = useState(COUNTDOWN_INITIAL);
  const [flash, setFlash] = useState(false);

  const initCam = () => {
    navigator.mediaDevices
      .getUserMedia({ video: { width: CAM_RES_WIDTH, height: CAM_RES_HEIGHT } })
      .then((stream) => {
        if (canvasRef.current) {
          canvasRef.current.width = SCREEN_WIDTH;
          canvasRef.current.height = SCREEN_HEIGHT;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
  };

  const getLandmark = (landmarks: Landmark[], indices: number[]): Landmark | null => {
    for (const index of indices) {
      if (landmarks[index]) {
        return landmarks[index];
      }
    }
    return null;
  };

  const calculatePosition = (
    landmarks: Landmark[],
    config: FaceOverlayConfig
  ): {
    center: { x: number; y: number; z: number };
    roll: number;
    scale: number;
  } | null => {
    if (config.type === "between") {
      if (!config.leftLandmarkIndices || !config.rightLandmarkIndices) {
        return null;
      }

      const leftPoint = getLandmark(landmarks, config.leftLandmarkIndices);
      const rightPoint = getLandmark(landmarks, config.rightLandmarkIndices);

      if (!leftPoint || !rightPoint) {
        return null;
      }

      const center = {
        x: (rightPoint.x + leftPoint.x) / 2,
        y: (rightPoint.y + leftPoint.y) / 2,
        z: ((rightPoint.z || 0) + (leftPoint.z || 0)) / 2,
      };

      const roll =
        Math.atan2(rightPoint.y - leftPoint.y, rightPoint.x - leftPoint.x) +
        (config.rotationOffset || 0);

      const dx = rightPoint.x - leftPoint.x;
      const dy = rightPoint.y - leftPoint.y;
      const scale = Math.hypot(dx, dy) * config.scale;

      return { center, roll, scale };
    } else if (config.type === "top") {
      if (!config.topLandmarkIndices) {
        return null;
      }

      // Get forehead point (front of head)
      const foreheadPoint = getLandmark(landmarks, config.topLandmarkIndices);
      if (!foreheadPoint) {
        return null;
      }

      // Get chin point to calculate face height
      const chinPoint = getLandmark(landmarks, [152, 175, 199]);
      if (!chinPoint) {
        return null;
      }

      // Get eye positions for head orientation
      const leftEye = getLandmark(landmarks, [249, 33, 130]);
      const rightEye = getLandmark(landmarks, [7, 263, 359]);
      if (!leftEye || !rightEye) {
        return null;
      }

      // Calculate face height for scaling
      const faceHeight = Math.hypot(
        chinPoint.x - foreheadPoint.x,
        chinPoint.y - foreheadPoint.y,
        (chinPoint.z || 0) - (foreheadPoint.z || 0)
      );

      // Calculate eye center
      const eyeCenter = {
        x: (leftEye.x + rightEye.x) / 2,
        y: (leftEye.y + rightEye.y) / 2,
        z: ((leftEye.z || 0) + (rightEye.z || 0)) / 2,
      };

      // Calculate face forward direction (from eye center to forehead)
      const faceForwardDx = foreheadPoint.x - eyeCenter.x;
      const faceForwardDy = foreheadPoint.y - eyeCenter.y;
      const faceForwardDz = (foreheadPoint.z || 0) - (eyeCenter.z || 0);
      const faceForwardLength = Math.hypot(faceForwardDx, faceForwardDy, faceForwardDz);

      if (faceForwardLength === 0) {
        return null;
      }

      // Normalize face forward direction
      const faceForward = {
        x: faceForwardDx / faceForwardLength,
        y: faceForwardDy / faceForwardLength,
        z: faceForwardDz / faceForwardLength,
      };

      // Calculate upward direction (from chin to forehead)
      const upDx = foreheadPoint.x - chinPoint.x;
      const upDy = foreheadPoint.y - chinPoint.y;
      const upDz = (foreheadPoint.z || 0) - (chinPoint.z || 0);
      const upLength = Math.hypot(upDx, upDy, upDz);

      if (upLength === 0) {
        return null;
      }

      // Position hat: move up from forehead and back (opposite to face forward)
      // This ensures hat is on top of head, not in front of face
      const headTopHeight = faceHeight * 0.4; // Distance up from forehead
      const headTopDepth = faceHeight * 0.35; // Distance back from forehead (behind the face)

      // Calculate top of head position
      const topOfHead = {
        x: foreheadPoint.x + (upDx / upLength) * headTopHeight - faceForward.x * headTopDepth,
        y: foreheadPoint.y + (upDy / upLength) * headTopHeight - faceForward.y * headTopDepth,
        z: (foreheadPoint.z || 0) + (upDz / upLength) * headTopHeight - faceForward.z * headTopDepth,
      };

      // Calculate width from reference points or use face width
      let width = 0;
      if (config.widthReferenceIndices && config.widthReferenceIndices.length >= 2) {
        const leftRef = getLandmark(landmarks, [config.widthReferenceIndices[0]]);
        const rightRef = getLandmark(landmarks, [config.widthReferenceIndices[1]]);
        if (leftRef && rightRef) {
          const refDx = rightRef.x - leftRef.x;
          const refDy = rightRef.y - leftRef.y;
          const refDz = (rightRef.z || 0) - (leftRef.z || 0);
          width = Math.hypot(refDx, refDy, refDz);
        }
      } else {
        // Use eye distance as reference
        const eyeDx = rightEye.x - leftEye.x;
        const eyeDy = rightEye.y - leftEye.y;
        const eyeDz = (rightEye.z || 0) - (leftEye.z || 0);
        width = Math.hypot(eyeDx, eyeDy, eyeDz) * 1.5; // Scale up for head width
      }

      if (width === 0) {
        return null;
      }

      // Calculate roll from eye positions (for hat rotation)
      let roll = config.rotationOffset || 0;
      roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) + (config.rotationOffset || 0);

      const scale = width * config.scale;

      return { center: topOfHead, roll, scale };
    } else if (config.type === "bottom") {
      if (!config.bottomLandmarkIndices) {
        return null;
      }

      const bottomPoint = getLandmark(landmarks, config.bottomLandmarkIndices);
      if (!bottomPoint) {
        return null;
      }

      // Calculate width from reference points or use face width
      let width = 0;
      if (config.widthReferenceIndices && config.widthReferenceIndices.length >= 2) {
        const leftRef = getLandmark(landmarks, [config.widthReferenceIndices[0]]);
        const rightRef = getLandmark(landmarks, [config.widthReferenceIndices[1]]);
        if (leftRef && rightRef) {
          const dx = rightRef.x - leftRef.x;
          const dy = rightRef.y - leftRef.y;
          width = Math.hypot(dx, dy);
        }
      } else {
        // Fallback: use eye distance as reference
        const leftEye = getLandmark(landmarks, [249, 33, 130]);
        const rightEye = getLandmark(landmarks, [7, 263, 359]);
        if (leftEye && rightEye) {
          const dx = rightEye.x - leftEye.x;
          const dy = rightEye.y - leftEye.y;
          width = Math.hypot(dx, dy) * 1.2; // Scale for mouth width
        }
      }

      if (width === 0) {
        return null;
      }

      const center = {
        x: bottomPoint.x,
        y: bottomPoint.y,
        z: bottomPoint.z || 0,
      };

      // Calculate roll from eye positions (for beard rotation with head)
      const leftEye = getLandmark(landmarks, [249, 33, 130]);
      const rightEye = getLandmark(landmarks, [7, 263, 359]);
      let roll = config.rotationOffset || 0;
      if (leftEye && rightEye) {
        roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) + (config.rotationOffset || 0);
      }

      const scale = width * config.scale;

      return { center, roll, scale };
    }

    return null;
  };

  const drawOverlay = (
    ctx: CanvasRenderingContext2D,
    overlayImg: HTMLImageElement,
    face: Face,
    config: FaceOverlayConfig
  ) => {
    const position = calculatePosition(face.keypoints, config);
    if (!position) return;

    const { center, roll, scale } = position;
    const aspect = overlayImg.naturalHeight / overlayImg.naturalWidth;
    const width = scale;
    const height = width * aspect;

    const xOffset = config.xOffset ? width * config.xOffset : 0;
    const yOffset = height * config.yOffset;

    ctx.save();
    ctx.translate(center.x + xOffset, center.y);
    ctx.rotate(roll);
    if (config.flipHorizontal) {
      ctx.scale(-1, 1);
    }
    ctx.drawImage(overlayImg, -width / 2, -height / 2 + yOffset, width, height);
    ctx.restore();
  };

  const renderRef = useRef<() => void>();

  renderRef.current = () => {
    const images = loadedImagesRef.current;
    const overlayImages = images.slice(0, FACE_OVERLAYS.length);
    const watermarkImg = images[FACE_OVERLAYS.length];

    if (!canvasRef.current || !videoRef.current || overlayImages.length === 0) {
      requestAnimationFrame(renderRef.current!);
      return;
    }

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) {
      requestAnimationFrame(renderRef.current!);
      return;
    }

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.save();
    ctx.translate(SCREEN_WIDTH, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoRef.current, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    ctx.restore();

    if (detector.current) {
      detector.current
        .estimateFaces(videoRef.current, { flipHorizontal: true })
        .then((faces: Face[]) => {
          faces.forEach((face) => {
            FACE_OVERLAYS.forEach((overlayConfig, index) => {
              const overlayImg = overlayImages[index];
              if (overlayImg) {
                drawOverlay(ctx, overlayImg, face, overlayConfig);
              }
            });
          });
        })
        .catch(() => {});
    }

    if (watermarkImg) {
      ctx.drawImage(
        watermarkImg,
        SCREEN_WIDTH - WATERMARK_X_OFFSET,
        WATERMARK_Y_OFFSET,
        WATERMARK_WIDTH,
        WATERMARK_HEIGHT
      );
    }

    requestAnimationFrame(renderRef.current!);
  };

  const initTensor = (cb: () => void) => {
    faceLandmarksDetection
      .createDetector(faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh, {
        runtime: "mediapipe",
        refineLandmarks: true,
        maxFaces: 2,
        solutionPath: `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${faceMesh.VERSION}`,
      })
      .then((det) => {
        detector.current = det;
        cb();
      });
  };

  const handleSaveImage = useCallback(() => {
    const image = canvasRef.current?.toDataURL("image/jpeg");
    if (!imageRef.current || !image) return;

    imageRef.current.src = image;

    fetch(UPLOAD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imgBase64: image }),
    })
      .then((res) => res.json())
      .then((json) => console.log("Uploaded:", json.file))
      .catch(() => console.log("Upload failed."));
  }, []);

  const handleCountback = useCallback(() => {
    if (countRef.current > 0) {
      setTimeout(() => {
        countRef.current -= 1;
        setDisplayCount(countRef.current);
        handleCountback();
      }, COUNTDOWN_INTERVAL);
    } else {
      countRef.current = COUNTDOWN_INITIAL;
      setDisplayCount(COUNTDOWN_INITIAL);
      setIsCountback(false);
      setFlash(true);
      setTimeout(() => setFlash(false), FLASH_DURATION);
      handleSaveImage();
    }
  }, [handleSaveImage]);

  useEffect(() => {
    preloadImages(IMAGES_TO_LOAD).then((images) => {
      loadedImagesRef.current = images;
      setImagesLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!imagesLoaded) return;

    initCam();

    const handlePlaying = () => {
      initTensor(() => {
        if (renderRef.current) {
          requestAnimationFrame(renderRef.current);
        }
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Enter") {
        if (imageRef.current?.src && imageRef.current.src !== "http://empty/") {
          imageRef.current.src = "http://empty/";
        } else {
          setIsCountback(true);
          handleCountback();
        }
      }
    };

    const video = videoRef.current;
    video?.addEventListener("playing", handlePlaying);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      video?.removeEventListener("playing", handlePlaying);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [imagesLoaded, handleCountback]);

  const containerStyle = {
    position: "relative" as const,
    scale: "1",
    transformOrigin: "top left",
    display: "flex",
    width: "100vw",
  };

  const canvasStyle = { width: "calc(100vw - 20px)" };
  const videoStyle = { display: "none" as const };

  const countdownStyle = {
    position: "absolute" as const,
    left: 0,
    top: 0,
    width: "calc(100vw - 20px)",
    height: "calc(100vh)",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "300px",
    color: "rgba(255,255,255,.7)",
    fontFamily: "sans-serif",
  };

  const flashStyle = {
    display: flash ? ("block" as const) : ("none" as const),
    position: "absolute" as const,
    left: 0,
    top: 0,
    width: "calc(100vw - 20px)",
    height: "100vh",
    background: "white",
    zIndex: 2,
  };

  const imageStyle = {
    position: "absolute" as const,
    left: 0,
    top: 0,
    width: "calc(100vw - 20px)",
    opacity: isCountback ? 0 : 1,
    border: "2px solid black",
  };

  return (
    <div style={containerStyle}>
      <canvas id="output" ref={canvasRef} style={canvasStyle} />
      <video id="video" autoPlay ref={videoRef} style={videoStyle} />

      {isCountback && <div style={countdownStyle}>{displayCount}</div>}

      <div style={flashStyle} />

      <img ref={imageRef} style={imageStyle} alt="" />
    </div>
  );
};

export default SimpleApp;
