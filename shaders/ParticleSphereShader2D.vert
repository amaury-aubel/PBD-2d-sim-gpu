#version 300 es

in vec2 a_position;
uniform float u_resolution;
uniform int u_numParticles;
uniform float u_particleRadius;

out vec3 v_color;

const vec3 colorRamp[] = vec3[] (
    vec3(1.0, 0.0, 0.0),
    vec3(1.0, 0.5, 0.0),
    vec3(1.0, 1.0, 0.0),
    vec3(1.0, 0.0, 1.0),
    vec3(0.0, 1.0, 0.0),
    vec3(0.0, 1.0, 1.0),
    vec3(0.0, 0.0, 1.0)
);

vec3 generateVertexColor() {
    
    // ramp color by particle id
    float segmentSize = float(u_numParticles)/6.0f;
    float segment = floor(float(gl_VertexID)/segmentSize);
    float t = (float(gl_VertexID) - segmentSize*segment)/segmentSize;
    vec3 startVal = colorRamp[int(segment)];
    vec3 endVal = colorRamp[int(segment) + 1];
    return mix(startVal, endVal, t);
}

// all shaders have a main function
void main() {  
  v_color = generateVertexColor();
  gl_PointSize = u_particleRadius;

  // convert the position to [-1..1]
  vec2 pos = a_position / u_resolution;
  gl_Position = vec4(pos,0.0,1.0);  
}