#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;

uniform float u_boundaryDist;
uniform float u_friction;
uniform float u_orient;
uniform sampler2D u_newPositionTex;  // currently estimated position
uniform sampler2D u_positionTex;     // position at beginning of time step

out vec4 outColor;

void main() {
  // compute texel coord from gl_FragCoord;
  ivec2 texelCoord = ivec2(gl_FragCoord.xy);
  vec2 new_p = texelFetch(u_newPositionTex, texelCoord, 0).xy;  
  
  // rotate coords based on sandbox orientation
  float s = sin(-u_orient);
  float c = cos(-u_orient);  
  vec2 rot_p = vec2(c*new_p.x - s*new_p.y, s*new_p.x + c*new_p.y);
          
  // collision with square boundary  
  vec2 dist = abs(rot_p) - u_boundaryDist;
  dist *= max(sign(dist), vec2(0,0)); // set it to 0 if dist<0
  vec2 d = 0.5*sign(-rot_p)*dist;

  // is there a collision?
  if (length(d) > 1e-2) {
    vec2 position = texelFetch(u_positionTex, texelCoord, 0).xy;

    // rotate back to world
    new_p.x += c * d.x + s * d.y;
    new_p.y += -s * d.x + c * d.y;

    // add corrective displacement with friction in the tangential direction
    vec2 N = normalize(new_p);
    vec2 delta = new_p - position;    
    vec2 normalDelta = dot(delta,N)*N;
    vec2 tangentialDelta = delta - normalDelta;    
    new_p = position + normalDelta + (u_friction * tangentialDelta);
  }
  
  outColor =  vec4(new_p, 0, 1);
}