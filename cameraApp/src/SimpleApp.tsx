import React, { useEffect, useRef, useState } from "react";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import * as faceMesh from "@mediapipe/face_mesh";

export const SimpleApp: React.FC = () => {
  const CAM_RES_WIDTH = 1280;
  const CAM_RES_HEIGHT = 720;
  const SCREEN_WIDTH = 1280;
  const SCREEN_HEIGHT = 720;
  const GLASSES_SCALE = 2;

  const imagesToLoad = ["glasses.png", "logo.svg"];

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const detector = useRef<any>(null);
  const loadedImagesRef = useRef<HTMLImageElement[]>([]);

  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [isCountback, setIsCountback] = useState(false);
  const count = useRef(3);
  const [displayCount, setDisplayCount] = useState(3);
  const [flash, setFlash] = useState(false);

  const preloadImages = (srcArray: string[]) => {
    return Promise.all(
      srcArray.map((src) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.src = src;
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Failed to load ${src}`));
        })
      )
    );
  };

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

  const calculateSkew = (landmarks: any[]) => {
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

  const render = () => {
    const [glassesImg, watermarkImg] = loadedImagesRef.current;

    if (!canvasRef.current || !videoRef.current) {
      requestAnimationFrame(render);
      return;
    }

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Draw camera
    
      ctx.save();
      ctx.translate(SCREEN_WIDTH, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      ctx.restore();

    if (detector.current) {
      detector.current
        .estimateFaces(videoRef.current, { flipHorizontal: true })
        .then((faces: any[]) => {
          faces.forEach((face) => {
            // Draw glasses centered on eyes
            const mutations = calculateSkew(face.keypoints);
            ctx.save();
            const cx = mutations.eyeMidPoint.x;
            const cy = mutations.eyeMidPoint.y;
            ctx.translate(cx, cy);
            ctx.rotate(mutations.roll + Math.PI);

            const width = mutations.scale * GLASSES_SCALE;
            const aspect = (glassesImg.naturalHeight || 1) / (glassesImg.naturalWidth || 1);
            const height = width * aspect;
            const yOffset = -height * 0.12;

            ctx.drawImage(glassesImg, -width / 2, -height / 2 + yOffset, width, height);
            ctx.restore();
          });
        })
        .catch(() => {});
    }

    // watermark
    if (loadedImagesRef.current[1]) {
      ctx.drawImage(loadedImagesRef.current[1], SCREEN_WIDTH - 230, 10, 220, 50);
    }

    requestAnimationFrame(render);
  };

  const initTensor = (cb: () => void) => {
    faceLandmarksDetection
      .createDetector(faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh, {
        runtime: "mediapipe",
        refineLandmarks: true,
        maxFaces: 2,
        solutionPath: `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${faceMesh.VERSION}`,
      })
      .then((det: any) => {
        detector.current = det;
        cb();
      });
  };

  const handleSaveImage = () => {
    const image = canvasRef.current?.toDataURL("image/jpeg");
    if (imageRef.current && image) {
      imageRef.current.src = image;

      
        fetch("http://172.104.138.166:8000/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imgBase64: image }),
        })
          .then((res) => res.json())
          .then((json) => {
            console.log("Uploaded:", json.file);
          })
          .catch(() => console.log("Upload failed."));

    }
  };

  const handleCountback = () => {
    if (count.current > 0) {
      setTimeout(() => {
        count.current = count.current - 1;
        setDisplayCount(count.current);
        handleCountback();
      }, 1000);
    } else {
      count.current = 3;
      setDisplayCount(3);
      setIsCountback(false);
      setFlash(true);
      setTimeout(() => setFlash(false), 100);
      handleSaveImage();
    }
  };

  useEffect(() => {
    preloadImages(imagesToLoad).then((images) => {
      loadedImagesRef.current = images;
      setImagesLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!imagesLoaded) return;

    initCam();

    const handlePlaying = () => {
      initTensor(() => {
        requestAnimationFrame(render);
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e as KeyboardEvent).code === "Enter") {
        if (imageRef.current?.src && imageRef.current.src !== "http://empty/") {
          imageRef.current.src = "http://empty/";
        } else {
          setIsCountback(true);
          handleCountback();
        }
      }
    };

    videoRef.current?.addEventListener("playing", handlePlaying);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      videoRef.current?.removeEventListener("playing", handlePlaying);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [imagesLoaded]);

  return (
    <div style={{ position: "relative", scale: "1", transformOrigin: "top left", display: "flex", width: "100vw" }}>
      <canvas id="output" ref={canvasRef} style={{ width: "calc(100vw - 20px)" }} />
      <video id="video" autoPlay ref={videoRef} style={{ display: "none" }} />

      {isCountback && (
        <div style={{ position: "absolute", left: 0, top: 0, width: "calc(100vw - 20px)", height: "calc(100vh)", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "300px", color: "rgba(255,255,255,.7)", fontFamily: "sans-serif" }}>
          {displayCount}
        </div>
      )}

      <div style={{ display: flash ? "block" : "none", position: "absolute", left: 0, top: 0, width: "calc(100vw - 20px)", height: "100vh", background: "white", zIndex: 2 }} />

      <img ref={imageRef} style={{ position: "absolute", left: 0, top: 0, width: "calc(100vw - 20px)", opacity: isCountback ? 0 : 1, border: "2px solid black" }} alt="" />
    </div>
  );
};

export default SimpleApp;
