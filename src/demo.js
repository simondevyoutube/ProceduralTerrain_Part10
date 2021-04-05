import {game} from './game.js';
import {graphics} from './graphics.js';
import {math} from './math.js';
import {noise} from './noise.js';


window.onload = function() {
  function _Perlin() {
    const canvas = document.getElementById("canvas"); 
    const context = canvas.getContext("2d");
  
    const imgData = context.createImageData(canvas.width, canvas.height);
  
    const params = {
      scale: 32,
      noiseType: 'simplex',
      persistence: 0.5,
      octaves: 1,
      lacunarity: 1,
      exponentiation: 1,
      height: 255
    };
    const noiseGen = new noise.Noise(params);

    for (let x = 0; x < canvas.width; x++) {
      for (let y = 0; y < canvas.height; y++) {
        const pixelIndex = (y * canvas.width + x) * 4;

        const n = noiseGen.Get(x, y);

        imgData.data[pixelIndex] = n;
        imgData.data[pixelIndex+1] = n;
        imgData.data[pixelIndex+2] = n;
        imgData.data[pixelIndex+3] = 255;
      }
    }
  
    context.putImageData(imgData, 0, 0);
}


function _Randomness() {
  const canvas = document.getElementById("canvas"); 
  const context = canvas.getContext("2d");

  const imgData = context.createImageData(canvas.width, canvas.height);

  const params = {
    scale: 32,
    noiseType: 'simplex',
    persistence: 0.5,
    octaves: 1,
    lacunarity: 2,
    exponentiation: 1,
    height: 1
  };
  const noiseGen = new noise.Noise(params);
  let foo = '';

  for (let x = 0; x < canvas.width; x++) {
    for (let y = 0; y < canvas.height; y++) {
      const pixelIndex = (y * canvas.width + x) * 4;

      const n = noiseGen.Get(x, y);
      if (x == 0) {
        foo += n + '\n';
      }

      imgData.data[pixelIndex] = n;
      imgData.data[pixelIndex+1] = n;
      imgData.data[pixelIndex+2] = n;
      imgData.data[pixelIndex+3] = 255;
    }
  }
  console.log(foo);

  context.putImageData(imgData, 0, 0);
}

_Randomness();
  
};
