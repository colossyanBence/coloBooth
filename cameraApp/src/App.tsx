import { useEffect, useRef, useState } from "react";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import * as faceMesh from "@mediapipe/face_mesh";
import { TRIANGULATION } from "./triangulation.js";
import { distance, drawPath, getCoordinate } from "./helpers.js";
import { FaceDetector } from "@tensorflow-models/face-detection";
import { GlassesImage } from "./glassesImage";
import { FaceLandmarksDetector } from "@tensorflow-models/face-landmarks-detection";


export const App = () => {
  const dryRun = false; // no API call
  
  // Overlay switches
  const showMask = true;
  const showContour = false;
  const showKeypoints = false;
  const showTriangulation = true;
  const showBoundingBox = false;
  const showEyes = false;
  const showImage = true;


  const image = new Image();
  image.src = GlassesImage;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const detector = useRef<FaceLandmarksDetector>(null);
  const [isCountback, setIsCountback] = useState(false);
  const [flash, setFlash] = useState(false);
  const [displayCount, setDisplayCount] = useState(3);
  const count = useRef(3);
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

  const getVars =(canvasCtx, landmarks) => {
    let canvas = canvasCtx.canvas;
    let xpos = landmarks[1].x;
    let ypos = landmarks[1].y;
    //let img = new Image;
    return {canvas, xpos, ypos};
  }

  const distance = (pos1, pos2) => {
    // get ratio of video element since x and y coordinates are given assuming square element
    let aspectRatio = 640/480;

    return Math.sqrt(
      (pos1.x - pos2.x) ** 2 * aspectRatio + 
      (pos1.y - pos2.y) ** 2 / aspectRatio +
      (pos1.z - pos2.z) ** 2
    );
  }

  const calculateSkew = (landmarks) => {
    
    //use 0 for middle, 359 for top right, and 130 for top left.
    const leftEyeCorner = landmarks[249];//130
    const rightEyeCorner = landmarks[7];//359
    const upperLip = landmarks[0];
    
    //midpoint between eye landmarks
    const eyeMidPoint = {
      x: (rightEyeCorner.x + leftEyeCorner.x)/2,
      y: (rightEyeCorner.y + leftEyeCorner.y)/2,
      z: (rightEyeCorner.z + leftEyeCorner.z)/2
    };

    //calculate angle in radians between eye connector and x-axis
    const roll = Math.atan2(
      (rightEyeCorner.y - leftEyeCorner.y),
      (rightEyeCorner.x - leftEyeCorner.x)
    );
                           
    //get frame of reference to display slopes
    const originPoint = {
      x: upperLip.x,
      y: eyeMidPoint.y,
      z: upperLip.z
    };
    //calculate angle between face slope and y-axis
    const pitch = Math.atan2(
      (eyeMidPoint.z - upperLip.z),
      (eyeMidPoint.y - upperLip.y) 
    );

    //calculate angle between (eyeMid -> upperlip) and z-axis
    const yaw = Math.atan2(
      (eyeMidPoint.z - upperLip.z),
      (eyeMidPoint.x - upperLip.x) 
    );

    const scale = distance(rightEyeCorner, leftEyeCorner);

    //draw lines beteen key points.
  /*   drawConnectors(canvasCtx,
      {0: leftEyeCorner, 1: rightEyeCorner, 2: upperLip, 3: eyeMidPoint, 4: originPoint},
      [[0,1],[2,3],[2,4]],
      {color: 'red', lineWidth: 1}) */

    return {roll: roll, scale: scale}
  }

  //let lastTime = new Date(); // FPS calculation

  const render = () => {
    //const currentTime = new Date(); // FPS calculation

    if (canvasRef.current && videoRef.current) {
      const ctx = canvasRef.current.getContext("2d");

      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 640, 480);
        if (detector.current) {
          detector.current
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
                  const mutations = calculateSkew(face.keypoints);
                  const {canvas, xpos, ypos} = getVars(ctx, face.keypoints);
                  
                  const dim = canvas.width * mutations.scale * .003;

                  ctx.beginPath();
                  ctx.fillStyle = "red";
                  ctx.arc(xpos, ypos, 10, 0, 2 * Math.PI);
                  ctx.fill();

                  ctx.save();
                  ctx.translate(xpos, ypos);
                  ctx.rotate(mutations.roll + 3.14);
                  ctx.drawImage(image, -(dim/2), -(dim/2)+40, dim, 90);
                  ctx.restore();
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
        // FPS calculation
        // const fps = 1000 / (currentTime - lastTime);
        // lastTime = currentTime;
        // console.log(fps);
        requestAnimationFrame(render);
      }
    }
  };

  const initTensor = (cb) => {
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
        detector.current = detectorInstance;
        cb();
      });
  };

  const handleSaveImage = () => {
    const image = canvasRef.current?.toDataURL("image/jpeg");
    if(imageRef.current && image) {
      // Update preview
      imageRef.current.src = image;

      // Send to API
      if(!dryRun){
        fetch("http://localhost:8000/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imgBase64: image,
          }),
        })
        .then((res) => {return res.json()})
        .then((json) => {
          console.log("Uploaded.");
          console.log(`http://localhost:8000/upload/${json.file}`);
        }).catch(() => {
          console.log("Upload failed.");
        });
      }
    }
  };

  const handleCountback = () => {
    if(count.current > 0){
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
      setTimeout(() => {
        setFlash(false);
      },100)
      console.log("Take a picture!");
      handleSaveImage();
    }
  
  }

  useEffect(() => {
    initCam();

    const handlePlaying = () => {
      initTensor(() => {
        // Render loop
        requestAnimationFrame(render);
      });
    };

    const handleKeyDown = (e) => {
      if(e.code === "KeyA") {
        if(imageRef.current?.src && imageRef.current.src !== "http://empty/"){
          imageRef.current.src = "http://empty/";
        }
        else {
          setIsCountback(true);
          handleCountback();
        }
      }
    }

    videoRef.current?.addEventListener("playing", handlePlaying);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      videoRef.current?.removeEventListener("playing", handlePlaying);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div style={{scale: "1", transformOrigin: "top left",display:"inline-block",}}>
      <canvas id="output" ref={canvasRef} style={{border: "2px solid red",}}></canvas>
      <video
        id="video"
        autoPlay
        ref={videoRef}
        style={{ display: "none" }}
      />
      {isCountback && (
        <div style={{position: "absolute", left: 0, top: 0, width: 640, height: 480, zIndex:2, display: "flex", alignItems: "center", justifyContent:"center", fontSize: "250px", color: "rgba(255,255,255,.7)", fontFamily: "sans-serif"}}>
          {displayCount}
        </div>
      )}
      <div style={{display: flash?"block":"none", position: "absolute", left: 0, top: 0, width: 640, height: 480, background :"white", zIndex:2,}}/>
      <img ref={imageRef} style={{position: "absolute",left:0, top: 0, opacity: isCountback?0:1, border: '2px solid black'}} alt=""/>
      
      <div>
        {/* <button onClick={handleSaveImage}>Take photo</button> */}
        <p>(Re)Start countdown with key "a"</p>
      </div>
    </div>
  );
};
