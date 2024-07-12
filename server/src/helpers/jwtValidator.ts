import express from "express";
import { jwtDecode } from "jwt-decode";

export const validateJWT = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const jwt = authHeader && authHeader.replace(/^Bearer\s/, '');
  
  if (jwt) {
    const tokenData = jwtDecode(jwt);
    if(tokenData && tokenData.sub === "coloboothCameraApp") {
      next();
    }
  }
  else {
      res.sendStatus(401);
  }
}