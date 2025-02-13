const fs = require('fs-extra');
const jimp = require('jimp');
const path = require('path');

const action  = async ({src , dest}) => {
  if(fs.existsSync(src)){
    await fs.ensureDir(path.dirname(dest));

    const ext = path.extname(src).toLowerCase();

    if(ext === ".gif" || ext === ".svg" || ext === ".ico"
    ){
      await fs.copy(src, dest);
    }
    else{
      let resizePromise = new Promise((resolve, reject)=>{
        jimp.read(src, function (err, lenna) {
          if (err)
          {
            console.log(err)
          }
          else{
            lenna.scaleToFit(400,400).write(dest, (err) =>{
              if(err) reject();
              else resolve();
            });
          }
        });


      });

      await resizePromise;
    }

    let thumbExistsPromise = new Promise((resolve)=>{
      fs.exists(dest,(exists)=> resolve(exists));
    });

    let thumbExists = await thumbExistsPromise;
    if(!thumbExists){
      throw new Error('Something went wrong');
    }
  }
}

module.exports = action;
