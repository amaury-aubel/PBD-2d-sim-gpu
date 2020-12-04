#version 300 es

// an attribute is an input (in) to a vertex shader.
// It will receive data from a buffer
in vec2 position;

// Used to pass in the resolution of the canvas
uniform float resolution;
uniform float orient;

// all shaders have a main function
void main() {

  // convert the position to [-1..1]
  vec2 pos = position / resolution;
  // rotate by orient radians
  float s = sin(orient);
  float c = cos(orient);
  vec2 rot_pos = vec2(c * pos[0] - s * pos[1], s * pos[0] + c * pos[1]);
  gl_Position = vec4(rot_pos, 0, 1);
}