#version 300 es

precision highp float;
precision highp int;
precision highp isampler2D;
precision highp sampler2D;

#define MAX_NBORS 24

uniform float u_friction;                  // tangential friction to apply
uniform float u_radius;                    // particle radius
uniform sampler2D u_latestPositionTex;     // currently estimated position
uniform sampler2D u_newPositionTex;        // previously estimated position
uniform sampler2D u_positionTex;           // position at beginning of time step
uniform isampler2D u_nborsTex;             // indices of neighbors texture

out vec4 outColor;

int getNbor(isampler2D tex, ivec2 dimensions, int index) {
  int y = index / dimensions.x;
  int x = index % dimensions.x;
  return texelFetch(tex, ivec2(x, y), 0).x;
}

vec2 getSample(sampler2D tex, ivec2 dimensions, int index) {
  int y = index / dimensions.x;
  int x = index % dimensions.x;
  return texelFetch(tex, ivec2(x, y), 0).xy;
}

void main() {
  // compute texel coord from gl_FragCoord;
  ivec2 texelCoord = ivec2(gl_FragCoord.xy);
  vec2 new_p =  texelFetch(u_latestPositionTex, texelCoord, 0).xy;    
  vec2 prev_new_p = texelFetch(u_newPositionTex, texelCoord, 0).xy;  
  vec2 position = texelFetch(u_positionTex, texelCoord, 0).xy;

  ivec2 nborsTexDimensions = textureSize(u_nborsTex, 0);      // size of mip 0  
  ivec2 posTexDimensions = textureSize(u_positionTex, 0);  // size of mip 0  
  
  
  // linearize index of particle we're currently computing
  int particleIdx = texelCoord.y*posTexDimensions.x + texelCoord.x;

  // loop over all possible neighbors and accumulate corrective displacement
  // loop over each possible neighbor particle 
  // and add friction in the tangential direction if there's a collision  
  for (int i=0; i<MAX_NBORS; i++) {   
    int nbor = getNbor(u_nborsTex, nborsTexDimensions, particleIdx*MAX_NBORS + i);
    if (nbor == -1) break;
    vec2 pos_nbor = getSample(u_newPositionTex, posTexDimensions, nbor);
    vec2 dir = prev_new_p - pos_nbor;
    float dist =  2.0*u_radius - length(dir);        
    // collision if dist > 0
    if (dist <= 0.0) continue;

    pos_nbor = getSample(u_latestPositionTex, posTexDimensions, nbor);
    vec2 delta = new_p - position;    
    vec2 N = normalize(new_p - pos_nbor);
    vec2 normalDelta = dot(delta,N) * N;
    vec2 tangentialDelta = delta - normalDelta;

    new_p = position + normalDelta + u_friction*tangentialDelta;
  }
  outColor =  vec4(new_p, 0, 1);
}