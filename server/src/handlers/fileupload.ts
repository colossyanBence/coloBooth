import { writeFile } from 'fs';

export const fileUpload = (req:any, res:any) => {
  const base64Data = req.body.imgBase64.replace(/^data:image\/jpeg;base64,/, "");
  const fileName = `${Date.now()}.jpg`;
  writeFile(`upload/${fileName}`, base64Data, 'base64', function(err) {
    if(err) console.log(err);
  });
  console.log(fileName);
  res.send(JSON.stringify({file: fileName}));
}