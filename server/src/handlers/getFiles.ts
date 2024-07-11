import fs from 'fs';

export const getFiles = async(_req:any, res:any) => {
  const files = await fs.promises.readdir('upload');
  res.send(JSON.stringify(files));
}