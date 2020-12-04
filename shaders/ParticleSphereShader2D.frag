#version 300 es

// fragment shaders don't have a default precision so we need
// to pick one. highp is a good default. It means "high precision"
precision highp float;

in vec3 v_color;

// we need to declare an output for the fragment shader
out vec4 outColor;

void main() {
    vec2 point = gl_PointCoord.xy*vec2(2.0, -2.0) + vec2(-1.0, 1.0);
    float mag = dot(point, point);
    if(mag > 1.0) discard; 
    
    outColor = vec4(v_color, 1);
}