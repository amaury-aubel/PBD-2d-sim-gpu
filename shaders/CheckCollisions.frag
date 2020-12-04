#version 300 es

precision highp float;
precision highp int;
precision highp isampler2D;
precision highp sampler2D;

#define MAX_NBORS 24
uniform float u_radius;                    // particle radius
uniform sampler2D u_newPositionTex;        // currently estimated position
uniform isampler2D u_nborsTex;             // indices of neighbors texture

out vec4 outColor;

int getNbor(isampler2D tex, ivec2 dimensions, int index) {
  int y = index / dimensions.x;
  int x = index % dimensions.x;
  return texelFetch(tex, ivec2(x, y), 0).x;
}

vec2 getNborPos(sampler2D tex, ivec2 dimensions, int index) {
  int y = index / dimensions.x;
  int x = index % dimensions.x;
  return texelFetch(tex, ivec2(x, y), 0).xy;
}

void main() {
  // compute texel coord from gl_FragCoord;
  ivec2 texelCoord = ivec2(gl_FragCoord.xy);
  vec2 new_p = texelFetch(u_newPositionTex, texelCoord, 0).xy;
  
  ivec2 nborsTexDimensions = textureSize(u_nborsTex, 0);      // size of mip 0
  ivec2 posTexDimensions = textureSize(u_newPositionTex, 0);  // size of mip 0
  
  // linearize index of particle we're currently computing
  int particleIdx = texelCoord.y*posTexDimensions.x + texelCoord.x;

  // loop over all possible neighbors and accumulate corrective displacement   
  vec2 disp = vec2(0.,0.);
  for (int i=0; i<MAX_NBORS; i++) {   
    int nbor = getNbor(u_nborsTex, nborsTexDimensions, particleIdx*MAX_NBORS + i);
    if (nbor == -1) break;
    vec2 pos_nbor = getNborPos(u_newPositionTex, posTexDimensions, nbor);
    vec2 dir = new_p - pos_nbor;

    float dist =  2.0*u_radius - length(dir);
    //if (dist < 0.0) continue;
    // collision if dist > 0, 
    // so strength will be zero for non-colliding particles
    // 0.25 = 0.5 (constraint weight) * 0.5 (half on each particle)
    float strength = 0.25 * max(0.0, dist);
    new_p += strength * normalize(dir);
  }
  
  outColor =  vec4(new_p, 0, 1);
}