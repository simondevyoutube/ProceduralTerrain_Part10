export const terrain_shader = (function() {

  const _VS = `#version 300 es

precision highp float;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
uniform float fogDensity;
uniform vec3 cloudScale;

// Attributes
in vec3 position;
in vec3 normal;
in vec3 coords;
in vec3 color;

// Outputs
out vec4 vColor;
out vec3 vNormal;
out vec3 vCoords;
out vec3 vVSPos;
out vec3 vRepeatingCoords;
out float vFragDepth;

#define saturate(a) clamp( a, 0.0, 1.0 )

void main(){
  mat4 terrainMatrix = mat4(
      viewMatrix[0],
      viewMatrix[1],
      viewMatrix[2],
      vec4(0.0, 0.0, 0.0, 1.0));

  gl_Position = projectionMatrix * terrainMatrix * modelMatrix * vec4(position, 1.0);

  vNormal = normal;

  vColor = vec4(color, 1);
  vCoords = (modelMatrix * vec4(position, 1.0)).xyz + cameraPosition;
  vVSPos = (terrainMatrix * modelMatrix * vec4(position, 1.0)).xyz;

  vec3 pos = coords;
  float p = 32768.0;
  float a = 1024.0;
  vRepeatingCoords = (4.0 * a / p) * abs(mod(pos, p) - p * 0.5);

  vFragDepth = 1.0 + gl_Position.w;
}
  `;
  

  const _PS = `#version 300 es

precision highp float;
precision highp int;
precision highp sampler2DArray;

uniform sampler2DArray normalMap;
uniform sampler2DArray diffuseMap;
uniform sampler2D noiseMap;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform vec3 cameraPosition;
uniform float logDepthBufFC;

in vec4 vColor;
in vec3 vNormal;
in vec3 vCoords;
in vec3 vRepeatingCoords;
in vec3 vVSPos;
in float vFragDepth;

out vec4 out_FragColor;

#define saturate(a) clamp( a, 0.0, 1.0 )

const float _TRI_SCALE = 10.0;

float sum( vec3 v ) { return v.x+v.y+v.z; }

vec4 hash4( vec2 p ) {
  return fract(
    sin(vec4(1.0+dot(p,vec2(37.0,17.0)), 
              2.0+dot(p,vec2(11.0,47.0)),
              3.0+dot(p,vec2(41.0,29.0)),
              4.0+dot(p,vec2(23.0,31.0))))*103.0);
}

vec4 _CalculateLighting(
    vec3 lightDirection, vec3 lightColour, vec3 worldSpaceNormal, vec3 viewDirection) {
  float NdotL = saturate(dot(worldSpaceNormal, lightDirection));
  // return vec4(lightColour * diffuse, 0.0);

  vec3 H = normalize(lightDirection + viewDirection);
  float NdotH = dot(worldSpaceNormal, H);
  float specular = saturate(pow(NdotH, 8.0));

  return vec4(lightColour * NdotL, specular * NdotL);
}

vec4 _ComputeLighting(vec3 worldSpaceNormal, vec3 sunDir, vec3 viewDirection) {
  // Hardcoded, whee!
  vec4 lighting;
  
  lighting += _CalculateLighting(
      sunDir, vec3(1.0, 1.0, 1.0), worldSpaceNormal, viewDirection);
  // lighting += _CalculateLighting(
  //     vec3(0, 1, 0), vec3(0.25, 0.25, 0.25), worldSpaceNormal, viewDirection);

  // lighting += vec4(0.15, 0.15, 0.15, 0.0);
  
  return lighting;
}

vec4 _TerrainBlend_4(vec4 samples[4]) {
  float depth = 0.2;
  float ma = max(
      samples[0].w,
      max(
          samples[1].w,
          max(samples[2].w, samples[3].w))) - depth;

  float b1 = max(samples[0].w - ma, 0.0);
  float b2 = max(samples[1].w - ma, 0.0);
  float b3 = max(samples[2].w - ma, 0.0);
  float b4 = max(samples[3].w - ma, 0.0);

  vec4 numer = (
      samples[0] * b1 + samples[1] * b2 +
      samples[2] * b3 + samples[3] * b4);
  float denom = (b1 + b2 + b3 + b4);
  return numer / denom;
}

vec4 _TerrainBlend_4_lerp(vec4 samples[4]) {
  return (
      samples[0] * samples[0].w + samples[1] * samples[1].w +
      samples[2] * samples[2].w + samples[3] * samples[3].w);
}

// Lifted from https://www.shadertoy.com/view/Xtl3zf
vec4 texture_UV(in sampler2DArray srcTexture, in vec3 x) {
  float k = texture(noiseMap, 0.0025*x.xy).x; // cheap (cache friendly) lookup
  float l = k*8.0;
  float f = fract(l);
  
  float ia = floor(l+0.5); // suslik's method (see comments)
  float ib = floor(l);
  f = min(f, 1.0-f)*2.0;

  vec2 offa = sin(vec2(3.0,7.0)*ia); // can replace with any other hash
  vec2 offb = sin(vec2(3.0,7.0)*ib); // can replace with any other hash

  vec4 cola = texture(srcTexture, vec3(x.xy + offa, x.z));
  vec4 colb = texture(srcTexture, vec3(x.xy + offb, x.z));

  return mix(cola, colb, smoothstep(0.2,0.8,f-0.1*sum(cola.xyz-colb.xyz)));
}

vec4 _Triplanar_UV(vec3 pos, vec3 normal, float texSlice, sampler2DArray tex) {
  vec4 dx = texture_UV(tex, vec3(pos.zy / _TRI_SCALE, texSlice));
  vec4 dy = texture_UV(tex, vec3(pos.xz / _TRI_SCALE, texSlice));
  vec4 dz = texture_UV(tex, vec3(pos.xy / _TRI_SCALE, texSlice));

  vec3 weights = abs(normal.xyz);
  weights = weights / (weights.x + weights.y + weights.z);

  return dx * weights.x + dy * weights.y + dz * weights.z;
}

vec4 _TriplanarN_UV(vec3 pos, vec3 normal, float texSlice, sampler2DArray tex) {
  // Tangent Reconstruction
  // Triplanar uvs
  vec2 uvX = pos.zy; // x facing plane
  vec2 uvY = pos.xz; // y facing plane
  vec2 uvZ = pos.xy; // z facing plane
  // Tangent space normal maps
  vec3 tx = texture_UV(tex, vec3(uvX / _TRI_SCALE, texSlice)).xyz * vec3(2,2,2) - vec3(1,1,1);
  vec3 ty = texture_UV(tex, vec3(uvY / _TRI_SCALE, texSlice)).xyz * vec3(2,2,2) - vec3(1,1,1);
  vec3 tz = texture_UV(tex, vec3(uvZ / _TRI_SCALE, texSlice)).xyz * vec3(2,2,2) - vec3(1,1,1);

  vec3 weights = abs(normal.xyz);
  weights = weights / (weights.x + weights.y + weights.z);

  // Get the sign (-1 or 1) of the surface normal
  vec3 axis = sign(normal);
  // Construct tangent to world matrices for each axis
  vec3 tangentX = normalize(cross(normal, vec3(0.0, axis.x, 0.0)));
  vec3 bitangentX = normalize(cross(tangentX, normal)) * axis.x;
  mat3 tbnX = mat3(tangentX, bitangentX, normal);

  vec3 tangentY = normalize(cross(normal, vec3(0.0, 0.0, axis.y)));
  vec3 bitangentY = normalize(cross(tangentY, normal)) * axis.y;
  mat3 tbnY = mat3(tangentY, bitangentY, normal);

  vec3 tangentZ = normalize(cross(normal, vec3(0.0, -axis.z, 0.0)));
  vec3 bitangentZ = normalize(-cross(tangentZ, normal)) * axis.z;
  mat3 tbnZ = mat3(tangentZ, bitangentZ, normal);

  // Apply tangent to world matrix and triblend
  // Using clamp() because the cross products may be NANs
  vec3 worldNormal = normalize(
      clamp(tbnX * tx, -1.0, 1.0) * weights.x +
      clamp(tbnY * ty, -1.0, 1.0) * weights.y +
      clamp(tbnZ * tz, -1.0, 1.0) * weights.z
      );
  return vec4(worldNormal, 0.0);
}

vec4 _Triplanar(vec3 pos, vec3 normal, float texSlice, sampler2DArray tex) {
  vec4 dx = texture(tex, vec3(pos.zy / _TRI_SCALE, texSlice));
  vec4 dy = texture(tex, vec3(pos.xz / _TRI_SCALE, texSlice));
  vec4 dz = texture(tex, vec3(pos.xy / _TRI_SCALE, texSlice));

  vec3 weights = abs(normal.xyz);
  weights = weights / (weights.x + weights.y + weights.z);

  return dx * weights.x + dy * weights.y + dz * weights.z;
}

vec4 _TriplanarN(vec3 pos, vec3 normal, float texSlice, sampler2DArray tex) {
  vec2 uvx = pos.zy;
  vec2 uvy = pos.xz;
  vec2 uvz = pos.xy;
  vec3 tx = texture(tex, vec3(uvx / _TRI_SCALE, texSlice)).xyz * vec3(2,2,2) - vec3(1,1,1);
  vec3 ty = texture(tex, vec3(uvy / _TRI_SCALE, texSlice)).xyz * vec3(2,2,2) - vec3(1,1,1);
  vec3 tz = texture(tex, vec3(uvz / _TRI_SCALE, texSlice)).xyz * vec3(2,2,2) - vec3(1,1,1);

  vec3 weights = abs(normal.xyz);
  weights *= weights;
  weights = weights / (weights.x + weights.y + weights.z);

  vec3 axis = sign(normal);
  vec3 tangentX = normalize(cross(normal, vec3(0.0, axis.x, 0.0)));
  vec3 bitangentX = normalize(cross(tangentX, normal)) * axis.x;
  mat3 tbnX = mat3(tangentX, bitangentX, normal);

  vec3 tangentY = normalize(cross(normal, vec3(0.0, 0.0, axis.y)));
  vec3 bitangentY = normalize(cross(tangentY, normal)) * axis.y;
  mat3 tbnY = mat3(tangentY, bitangentY, normal);

  vec3 tangentZ = normalize(cross(normal, vec3(0.0, -axis.z, 0.0)));
  vec3 bitangentZ = normalize(-cross(tangentZ, normal)) * axis.z;
  mat3 tbnZ = mat3(tangentZ, bitangentZ, normal);

  vec3 worldNormal = normalize(
      clamp(tbnX * tx, -1.0, 1.0) * weights.x +
      clamp(tbnY * ty, -1.0, 1.0) * weights.y +
      clamp(tbnZ * tz, -1.0, 1.0) * weights.z);
  return vec4(worldNormal, 0.0);
}

void main() {
  vec3 worldPosition = vCoords;
  vec3 eyeDirection = normalize(worldPosition - cameraPosition);
  vec3 sunDir = normalize(vec3(1, 1, -1));
  vec3 worldSpaceNormal = normalize(vNormal);

  // Bit of a hack to remove lighting on dark side of planet
  vec3 diffuse = vec3(0.75);
  vec3 planetNormal = normalize(worldPosition);
  float planetLighting = saturate(dot(planetNormal, sunDir));

  vec4 lighting = _ComputeLighting(worldSpaceNormal, sunDir, -eyeDirection);
  vec3 finalColour = mix(vec3(1.0, 1.0, 1.0), vColor.xyz, 0.25) * diffuse + lighting.w * 0.1;
  // vec3 finalColour = mix(vec3(1.0, 1.0, 1.0), vColor.xyz, 0.25);

  finalColour *= lighting.xyz;
  finalColour = lighting.xyz;
  // finalColour = vColor.xyz;

  out_FragColor = vec4(finalColour, 1);
  gl_FragDepth = log2(vFragDepth) * logDepthBufFC * 0.5;
}

  `;
  
  return {
    VS: _VS,
    PS: _PS,
  };
})();
  