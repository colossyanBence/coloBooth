import { useCallback, useEffect, useRef, useState } from "react";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import * as faceMesh from "@mediapipe/face_mesh";

const CAM_RES_WIDTH = 1280;
const CAM_RES_HEIGHT = 720;
const SCREEN_WIDTH = 1280;
const SCREEN_HEIGHT = 720;
const GLASSES_SCALE = 2;
const GLASSES_Y_OFFSET = 0.12;
const COUNTDOWN_INITIAL = 3;
const FLASH_DURATION = 100;
const COUNTDOWN_INTERVAL = 1000;
const WATERMARK_WIDTH = 220;
const WATERMARK_HEIGHT = 50;
const WATERMARK_X_OFFSET = 230;
const WATERMARK_Y_OFFSET = 10;
const UPLOAD_URL = "http://172.104.138.166:8000/upload";

const IMAGES_TO_LOAD = ["glasses.png", "logo.svg"];

interface Landmark {
  x: number;
  y: number;
  z?: number;
}

interface Face {
  keypoints: Landmark[];
}

interface SkewResult {
  roll: number;
  scale: number;
  eyeMidPoint: { x: number; y: number; z: number };
}

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

  const calculateSkew = (landmarks: Landmark[]): SkewResult => {
    const leftEyeCorner = landmarks[249] || landmarks[33] || landmarks[130];
    const rightEyeCorner = landmarks[7] || landmarks[263] || landmarks[359];

    const eyeMidPoint = {
      x: (rightEyeCorner.x + leftEyeCorner.x) / 2,
      y: (rightEyeCorner.y + leftEyeCorner.y) / 2,
      z: ((rightEyeCorner.z || 0) + (leftEyeCorner.z || 0)) / 2,
    };

    const roll = Math.atan2(
      rightEyeCorner.y - leftEyeCorner.y,
      rightEyeCorner.x - leftEyeCorner.x
    );

    const dx = rightEyeCorner.x - leftEyeCorner.x;
    const dy = rightEyeCorner.y - leftEyeCorner.y;
    const scale = Math.hypot(dx, dy);

    return { roll, scale, eyeMidPoint };
  };

  const drawGlasses = (
    ctx: CanvasRenderingContext2D,
    glassesImg: HTMLImageElement,
    face: Face
  ) => {
    const { roll, scale, eyeMidPoint } = calculateSkew(face.keypoints);
    const width = scale * GLASSES_SCALE;
    const aspect = glassesImg.naturalHeight / glassesImg.naturalWidth;
    const height = width * aspect;
    const yOffset = -height * GLASSES_Y_OFFSET;

    ctx.save();
    ctx.translate(eyeMidPoint.x, eyeMidPoint.y);
    ctx.rotate(roll + Math.PI);
    ctx.drawImage(glassesImg, -width / 2, -height / 2 + yOffset, width, height);
    ctx.restore();
  };

  const renderRef = useRef<() => void>();

  renderRef.current = () => {
    const [glassesImg, watermarkImg] = loadedImagesRef.current;

    if (!canvasRef.current || !videoRef.current || !glassesImg) {
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
          faces.forEach((face) => drawGlasses(ctx, glassesImg, face));
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
