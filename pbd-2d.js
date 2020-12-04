"use strict";

import { parseOBJ } from './shader-utils.js';
import { Boundary } from './boundary.js';
import { PBDSolverGPU } from './pbd-solver-gpu.js';

const gridMax = 50.0;                  // upper corner of simulation
const gridMin = -gridMax;              // lower corner of grid = (-gridMax, -gridMax)
const radiusBoundary = 0.72 * gridMax;   // dist of the boundary

var numGridCells = 100;                // resolution
var cellSize = 2 * gridMax / numGridCells; // length of 1 grid cell
var particleRadius = cellSize * 0.5;


async function main() {

  // Get A WebGL context  
  const canvas = document.querySelector("#canvas");
  const gl = canvas.getContext("webgl2", { antialias: true });
  if (!gl) {
    alert("Your browser does not support WebGL 2")
    return;
  }
  const ext = gl.getExtension('EXT_color_buffer_float');
  if (!ext) {
    alert("Your browser does not support EXT_color_buffer_float")
    return;
  }

  // look up the divcontainer
  const loadContainerElement = document.querySelector("#load");  

  // load PBD text shape that's stored in an "OBJ"-like format
  let response = await fetch("resources/pbd_font.txt");
  let text = await response.text();
  let fontShape = parseOBJ(text);

  // UI parameters defaults
  let parametersUI = {
    iterations: 2,
    spin: 0,
    friction: 0.80,
    maxSpeed: 50,
    GPU: ext ? true : false,
    resolution: 0,
    preset: 0,
  };

  // simulation variables
  let orient = 0;               // current orientation
  let spin = 0;                 // rotation speed
  const speed = 3.0;            // in increments of 1/60 seconds
  let elapsedTime = 0;
  const nstep = 3;              // number of substeps for a simulation frame
  let resolution = parametersUI.resolution;
  let gpu = ext ? true : false;   // use GPU acceleration

  // Load all shaders from separate files
  response = await fetch('shaders/ParticleSphereShader2D.vert');
  let vs = await response.text();
  response = await fetch('shaders/ParticleSphereShader2D.frag');
  let fs = await response.text();
  response = await fetch("shaders/default.vert");
  let defaultVS = await response.text();
  response = await fetch("shaders/PositionEstimator.frag");
  let estimatePositionFS = await response.text();
  response = await fetch("shaders/BoundaryConstrain.frag");
  let constrainToBoundaryFS = await response.text();
  response = await fetch("shaders/CheckCollisions.frag");
  let checkCollisionFS = await response.text();
  response = await fetch("shaders/ConstrainParticles.frag");
  let constrainParticlesFS = await response.text();
  response = await fetch("shaders/VelocityUpdate.frag");
  let updateVelocityFS = await response.text();
  response = await fetch("shaders/PositionUpdate.frag");
  let updatePositionFS = await response.text();
  response = await fetch('shaders/Boundary.vert');
  let boundaryVS = await response.text();
  response = await fetch('shaders/Boundary.frag');
  let boundaryFS = await response.text();

  let shaders = {
    defaultVS,
    estimatePositionFS,
    constrainToBoundaryFS,
    checkCollisionFS,
    constrainParticlesFS,
    updateVelocityFS,
    updatePositionFS,
    boundaryVS,
    boundaryFS,
  }

  // Use utils to compile the shaders and link into a program
  let program = webglUtils.createProgramFromSources(gl, [vs, fs]);

  // look up where the vertex data needs to go.
  let positionAttributeLoc = gl.getAttribLocation(program, "a_position");
  let resolutionLoc = gl.getUniformLocation(program, "u_resolution");
  let numParticlesLoc = gl.getUniformLocation(program, "u_numParticles");
  let particleRadiusLoc = gl.getUniformLocation(program, "u_particleRadius");

  // create Position-Based dynamics solver
  let pbd = new PBDSolverGPU(gl, shaders, numGridCells, particleRadius, gridMin, radiusBoundary);
  let positions = pbd.emitParticles( (x, y, data) => m3.distance(x, y, data.pos[0], data.pos[1]) < data.radius,
                                       {pos: [10, 0], radius: 10});

  // Create a buffer and put points in it
  let positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  // Create a vertex array object (attribute state)
  let vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  // Turn on the attribute
  gl.enableVertexAttribArray(positionAttributeLoc);

  // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
  let size = 2;          // 2 components per iteration
  let type = gl.FLOAT;   // the data is 32bit floats
  let normalize = false; // don't normalize the data
  let stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
  let offset = 0;        // start at the beginning of the buffer
  gl.vertexAttribPointer(
    positionAttributeLoc, size, type, normalize, stride, offset);

  // hide message that says "loading..."
  loadContainerElement.hidden = true    
  let boundary = new Boundary(gl, shaders, radiusBoundary + particleRadius, particleRadius * 0.5);

  let params = [
    { type: "slider", key: "iterations", change: updateUI, min: 1, max: 16, },
    { type: "slider", key: "spin", change: updateUI, min: -2, max: 2, precision: 2, step: 0.05, uiPrecision: 2 },
    { type: "slider", key: "friction", change: updateUI, min: 0, max: 1, precision: 2, step: 0.01, uiPrecision: 2 },
    { type: "slider", key: "maxSpeed", change: updateUI, min: 40, max: 100 },
  ];
  // only include GPU if webGL extension available
  if (ext) params.push({ type: "checkbox", key: "GPU", change: updateUI });
  params.push({ type: "option", key: "resolution", change: applyPreset, options: ["low", "medium", "high",/* "ultrahigh"*/] });
  params.push({ type: "option", key: "preset", change: applyPreset, options: ["none", "washer", "splashy", "sticky", "font", "inverse"] });
  let widgets = webglLessonsUI.setupUI(document.querySelector("#ui"), parametersUI, params);
  updateUI();

  // handle mouse clicks
  gl.canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    emitParticles(e);
  });

  // handle keyboard
  window.addEventListener('keydown', (e) => {
    if (e.key == "r") {
      e.preventDefault();

      // this will trigger a reset of the sim as the resolution is now different than the UI
      resolution = (parametersUI.resolution == 0) ? 1 : 0;
      applyPreset();
    }
  });

  // pass pointer to function to draw scene
  requestAnimationFrame(drawScene);

  // draw the scene
  function drawScene(curTime) {

    // advance simulation
    orient += spin;
    if (elapsedTime > 0.5) {
      pbd.orient = orient;
      pbd.elapsedTime = elapsedTime;
      pbd.switchMode(gpu);
      pbd.advanceFrame(speed / 60.0, nstep);
    }
    elapsedTime += 1 / 60.0;

    let numParticles = pbd.positions.length / 2; // x and y coords

    // draw on the whole canvas
    webglUtils.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Clear the canvas
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Tell it to use our program (pair of shaders)
    gl.useProgram(program);

    // Bind the attribute/buffer set we want.
    gl.bindVertexArray(vao);

    // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pbd.positions), gl.STATIC_DRAW);

    // draw  
    gl.uniform1f(resolutionLoc, gridMax);
    gl.uniform1i(numParticlesLoc, numParticles);
    gl.uniform1f(particleRadiusLoc, gl.canvas.width / (1.25 * numGridCells));
    gl.drawArrays(gl.POINTS, 0, numParticles);

    boundary.draw(gl, gridMax, orient, [1, 1, 1, 1]);

    // Call drawScene again next frame
    requestAnimationFrame(drawScene);
  }

  function emitParticles(e) {
    const rect = canvas.getBoundingClientRect();

    // normalized coordinates [0..1]
    let pos = [(e.clientX - rect.left) / (rect.right - rect.left),
    (e.clientY - rect.bottom) / (rect.top - rect.bottom)];

    // device coordinates [-1..1]
    pos = [2 * (pos[0] - 0.5), 2 * (pos[1] - 0.5)];

    // simuation coordinates
    pos = [gridMax * pos[0], gridMax * pos[1]];
    pbd.emitParticles( (x, y, data) => m3.distance(x, y, data.pos[0], data.pos[1]) < data.radius,
                        {pos, radius: 10} );
  }

  function applyPreset() {

    switch (parametersUI.preset) {
      case 0: break;
      case 1: //'washer",        
        parametersUI.iterations = 2;
        parametersUI.spin = 2.0;
        parametersUI.friction = 0.0;
        parametersUI.maxSpeed = 90.0 - parametersUI.resolution * 20;
        break;
      case 2: //"splashy", 
        parametersUI.iterations = 3 + parametersUI.resolution;
        parametersUI.spin = 0.0;
        parametersUI.friction = 0.0;
        parametersUI.maxSpeed = 75.0 - parametersUI.resolution * 15;
        break;
      case 3: //"sticky"
        parametersUI.iterations = 4 + 3 * parametersUI.resolution;
        parametersUI.spin = 0.0;
        parametersUI.friction = 1;
        parametersUI.maxSpeed = 50.0;
        break;
      case 4: //"font"
        parametersUI.iterations = 2 + 2 * parametersUI.resolution;
        parametersUI.spin = 0.0;
        parametersUI.friction = 0.8;
        parametersUI.maxSpeed = 50.0;
        resolution = (parametersUI.resolution == 0) ? 1 : 0; // force a reset of the sim
        break;
      case 5: //"inverse"
        parametersUI.iterations = 4 + 4 * parametersUI.resolution;
        parametersUI.spin = 0.0;
        parametersUI.friction = 0.65;
        parametersUI.maxSpeed = 50.0;
        resolution = (parametersUI.resolution == 0) ? 1 : 0; // force a reset of the sim
        break;
    }
    webglLessonsUI.updateUI(widgets, parametersUI);
    updateUI();
  }

  function updateUI() {

    // handle change of res first
    if (resolution != parametersUI.resolution) {
      // reset simulator
      orient = 0;
      spin = 0;
      elapsedTime = 0;
      resolution = parametersUI.resolution;
      switch (resolution) {
        case 0:
          numGridCells = 100;
          break;
        case 1:
          numGridCells = 160;
          break;
        case 2:
          numGridCells = 200;
          break;
        case 3:
          numGridCells = 320;
          break;
      }
      cellSize = 2 * gridMax / numGridCells; // length of 1 grid cell
      particleRadius = cellSize * 0.5;

      boundary = new Boundary(gl, shaders, radiusBoundary + particleRadius, particleRadius * 0.5);
      pbd = new PBDSolverGPU(gl, shaders, numGridCells, particleRadius, gridMin, radiusBoundary);
      if (parametersUI.preset < 4) {
        positions = pbd.emitParticles( (x, y, data) => m3.distance(x, y, data.pos[0], data.pos[1]) < data.radius,
                                     {pos: [10, 0], radius: 10} );
      }
      else {
        function isInShape(x, y, data) {
          let shape = data.shape;
          let scale = data.scale;
          
          // shamelessly taken from stack overflow
          // (nice use of the determinant I must say)
          //
          // returns true iff the line from (a,b)->(c,d) intersects with (p,q)->(r,s)
          function intersects(a, b, c, d, p, q, r, s) {
            let det, gamma, lambda;
            det = (c - a) * (s - q) - (r - p) * (d - b);
            if (det === 0) return false;
            else {
              lambda = ((s - q) * (r - a) + (p - r) * (s - b)) / det;
              gamma = ((b - d) * (r - a) + (c - a) * (s - b)) / det;
              return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
            }
          };
          let numIntersection = 0;
          // loop over all prims
          for (const prim of shape.prims) {
            // loop over all segments in this prim
            for (let i=0; i<prim.length-1; ++i) {
              // retrieve two end points of segment
              let p0 = shape.positions[prim[i]];
              let p1 = shape.positions[prim[i+1]];
              let p = p0[0] * scale;
              let q = p0[1] * scale;
              let r = p1[0] * scale;
              let s = p1[1] * scale;
              if (intersects(x,y,x,y+gridMax*5,p,q,r,s)) numIntersection++;
            }
          }
          let modulo = numIntersection % 2;
          return data.invert ? modulo==0 : modulo==1;
        }
        
        positions = pbd.emitParticles(isInShape, { shape: fontShape, scale: gridMax*2,
                                                   invert:  parametersUI.preset == 5 } );
      }
    }
    gpu = ext && parametersUI.GPU;
    pbd.numConstraintIteration = parametersUI.iterations;
    spin = parametersUI.spin * Math.PI / 180.0;
    pbd.maxSpeed = parametersUI.maxSpeed;
    // non-linear scale for friction, actual parameter range [0.001 - 0.33]    
    // As each time step has 3 internal substeps, this gives a final range of [0.003 - 1] for friction
    let friction = 0.001 * 1.06 ** (parametersUI.friction * 100);
    pbd.friction = friction;
    pbd.boundaryFriction = friction * 0.5;
  }
}

main();