#version 300 es

precision highp float;
precision highp sampler2D;

uniform float u_deltaTime;
uniform float u_step;
uniform float u_maxSpeed;
uniform sampler2D u_newPositionTex;        // currently estimated position
uniform sampler2D u_positionTex;           // position at beginning of time step

out vec4 outColor;

void main() {
  // compute texel coord from gl_FragCoord;
  ivec2 texelCoord = ivec2(gl_FragCoord.xy);
  vec2 new_p = texelFetch(u_newPositionTex, texelCoord, 0).xy;  
  vec2 position = texelFetch(u_positionTex, texelCoord, 0).xy;

  vec2 velocity = (new_p - position) / u_deltaTime;

  // clamp velocity if needed
  // we multiply by # of steps because our max Speed is absolute
  float speed = length(velocity) * u_step; 
  if (speed > u_maxSpeed) velocity *= u_maxSpeed / speed;

  outColor = vec4(velocity, 0, 1);
}
