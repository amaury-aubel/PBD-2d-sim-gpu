#version 300 es

precision highp float;
precision highp sampler2D;


uniform sampler2D u_positionTex;
uniform sampler2D u_velocityTex;
uniform float u_deltaTime;
uniform vec2 u_gravityForce;

out vec4 outColor;

void main() {
  // compute texel coord from gl_FragCoord;
  ivec2 texelCoord = ivec2(gl_FragCoord.xy);

  vec2 position = texelFetch(u_positionTex, texelCoord, 0).xy;
  vec2 velocity =  texelFetch(u_velocityTex, texelCoord, 0).xy + u_gravityForce;  

  // new estimated position by using velocity at the end of the time step  
  vec2 newPosition = position + velocity * u_deltaTime;
  outColor = vec4(newPosition, 0, 1);
}