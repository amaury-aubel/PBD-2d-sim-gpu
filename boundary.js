"use strict";

class Boundary {

  constructor(gl, shaders, size, width) {
    this.gl = gl;
    
    this.program = webglUtils.createProgramFromSources(gl,[shaders.boundaryVS, shaders.boundaryFS]);    

    // look up where the vertex data needs to go.
    let positionAttributeLoc = gl.getAttribLocation(this.program, "position");    
    this.resolutionLoc = gl.getUniformLocation(this.program, "resolution");
    this.colorLoc = gl.getUniformLocation(this.program, "color");    
    this.orientLoc = gl.getUniformLocation(this.program, "orient");

    // Create a buffer and put three 2d clip space points in it
    let positionBuffer = gl.createBuffer();

    // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
     
    let positions = this.getGeometry(size,width);
    //console.log(positions);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    // Create a vertex array object (attribute state)
    this.vao = gl.createVertexArray();
    

    // and make it the one we're currently working with
    gl.bindVertexArray(this.vao);

    // Turn on the attribute
    gl.enableVertexAttribArray(positionAttributeLoc);

    // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
    /*
    let size = 2;          // 2 components per iteration
    let type = gl.FLOAT;   // the data is 32bit floats
    let normalize = false; // don't normalize the data
    let stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
    let offset = 0;        // start at the beginning of the buffer
    */
    gl.vertexAttribPointer(
      positionAttributeLoc, 2, gl.FLOAT, false, 0, 0);
            
  }

  getGeometry(size, width) {

    let pos       = [-size,-size,
                     -size, size,
                     size, size,
                     size, -size,
                     -size-width, -size-width,
                     -size-width, size+width,
                     size+width,  size+width,
                     size+width, -size-width];

    let triangles = [1,5,2,
                     5,6,2,
                     2,6,3,
                     3,6,7,
                     3,7,0,
                     0,7,4,
                     4,1,0,
                     5,1,4];

    let result=[];
    for (const tri of triangles) result.push(pos[2*tri], pos[2*tri+1]);  // x and y coord
    return result;
  }

  draw(gl, resolution, orient, color) {

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // update uniforms
    gl.uniform4f(this.colorLoc, color[0], color[1], color[2], color[3]);
    gl.uniform1f(this.resolutionLoc, resolution);
    gl.uniform1f(this.orientLoc, orient);

    // draw 24 triangles
    gl.drawArrays(gl.TRIANGLES, 0, 24);
  }
  
}
export {Boundary};
