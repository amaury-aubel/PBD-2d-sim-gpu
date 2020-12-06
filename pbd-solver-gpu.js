"use strict";

import {
  createDataTexture, createIntDataTexture, createFramebuffer,
  makeBuffer, makeVertexArray, createProgram
} from './shader-utils.js';


class PBDSolverGPU {

  gravity = 9.81;
  boundaryFriction = 0.05;
  friction = 0.1;
  numConstraintIteration = 2;
  orient = 0;
  elapsedTime = 0;
  maxSpeed = 100;
  gpu = true;
  maxNbors = 24;

  constructor(gl, shaders, numCells, particleRadius, gridMin, radiusBoundary) {
    // clear position and velocity
    this.positions = [];
    this.velocities = [];
    this.cellSize = particleRadius * 2;
    this.numGridCells = numCells;
    this.origin = gridMin;
    this.boundary = [radiusBoundary, radiusBoundary]; // boundary is a square shape
    this.gl = gl;

    //  create buffer for single quad rasterization
    this.quadBuffer = makeBuffer(gl, new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ]), gl.STATIC_DRAW);

    //
    // ESTIMATE POSITION PROGRAM
    //
    this.estimatePositionPrg = createProgram(gl, [shaders.defaultVS, shaders.estimatePositionFS]);
    this.estimatePositionPrgLocs = {
      position: gl.getAttribLocation(this.estimatePositionPrg, 'a_position'),
      positionTex: gl.getUniformLocation(this.estimatePositionPrg, 'u_positionTex'),
      velocityTex: gl.getUniformLocation(this.estimatePositionPrg, 'u_velocityTex'),
      gravityForce: gl.getUniformLocation(this.estimatePositionPrg, 'u_gravityForce'),
      deltaTime: gl.getUniformLocation(this.estimatePositionPrg, 'u_deltaTime'),
    };
    this.estimatePositionVA = makeVertexArray(gl, [[this.quadBuffer, this.estimatePositionPrgLocs.position]]);

    //
    // CONSTRAIN TO BOUNDARY PROGRAM
    //
    this.constrainToBoundaryProgram = createProgram(gl, [shaders.defaultVS, shaders.constrainToBoundaryFS]);
    this.constrainToBoundaryPrgLocs = {
      position: gl.getAttribLocation(this.constrainToBoundaryProgram, 'a_position'),
      newPositionTex: gl.getUniformLocation(this.constrainToBoundaryProgram, 'u_newPositionTex'),
      positionTex: gl.getUniformLocation(this.constrainToBoundaryProgram, 'u_positionTex'),
      friction: gl.getUniformLocation(this.constrainToBoundaryProgram, 'u_friction'),
      boundaryDist: gl.getUniformLocation(this.constrainToBoundaryProgram, 'u_boundaryDist'),
      orient: gl.getUniformLocation(this.constrainToBoundaryProgram, 'u_orient'),
    };
    this.constrainToBoundaryVA = makeVertexArray(gl, [[this.quadBuffer, this.constrainToBoundaryPrgLocs.position]]);

    //
    // Check Particle Collisions PROGRAM
    //
    this.checkCollisionProgram = createProgram(gl, [shaders.defaultVS, shaders.checkCollisionFS]);
    this.checkCollisionPrgLocs = {
      position: gl.getAttribLocation(this.checkCollisionProgram, 'a_position'),
      newPositionTex: gl.getUniformLocation(this.checkCollisionProgram, 'u_newPositionTex'),
      nborsTex: gl.getUniformLocation(this.checkCollisionProgram, 'u_nborsTex'),
      radius: gl.getUniformLocation(this.checkCollisionProgram, 'u_radius'),
    };
    this.checkCollisionVA = makeVertexArray(gl, [[this.quadBuffer, this.checkCollisionPrgLocs.position]]);

    //
    // Constrain Particles PROGRAM
    //
    this.constrainParticlesProgram = createProgram(gl, [shaders.defaultVS, shaders.constrainParticlesFS]);
    this.constrainParticlesPrgLocs = {
      position: gl.getAttribLocation(this.constrainParticlesProgram, 'a_position'),
      latestPositionTex: gl.getUniformLocation(this.constrainParticlesProgram, 'u_latestPositionTex'),
      newPositionTex: gl.getUniformLocation(this.constrainParticlesProgram, 'u_newPositionTex'),
      positionTex: gl.getUniformLocation(this.constrainParticlesProgram, 'u_positionTex'),
      nborsTex: gl.getUniformLocation(this.constrainParticlesProgram, 'u_nborsTex'),
      radius: gl.getUniformLocation(this.constrainParticlesProgram, 'u_radius'),
      friction: gl.getUniformLocation(this.constrainParticlesProgram, 'u_friction'),
    };
    this.constrainParticlesVA = makeVertexArray(gl, [[this.quadBuffer, this.constrainParticlesPrgLocs.position]]);

    //
    // UPDATE VELOCITY PROGRAM
    //        
    this.updateVelocityProgram = createProgram(gl, [shaders.defaultVS, shaders.updateVelocityFS]);
    this.updateVelocityPrgLocs = {
      position: gl.getAttribLocation(this.updateVelocityProgram, 'a_position'),
      positionTex: gl.getUniformLocation(this.updateVelocityProgram, 'u_positionTex'),
      step: gl.getUniformLocation(this.updateVelocityProgram, 'u_step'),
      maxSpeed: gl.getUniformLocation(this.updateVelocityProgram, 'u_maxSpeed'),
      deltaTime: gl.getUniformLocation(this.updateVelocityProgram, 'u_deltaTime'),
    };
    this.updateVelocityVA = makeVertexArray(gl, [[this.quadBuffer, this.updateVelocityPrgLocs.position]]);

    //
    // UPDATE POSITION PROGRAM
    //    
    this.updatePositionProgram = createProgram(gl, [shaders.defaultVS, shaders.updatePositionFS]);
    this.updatePositionPrgLocs = {
      position: gl.getAttribLocation(this.updatePositionProgram, 'a_position'),
      positionTex: gl.getUniformLocation(this.updatePositionProgram, 'u_positionTex'),
      velocityTex: gl.getUniformLocation(this.updatePositionProgram, 'u_velocityTex'),
      deltaTime: gl.getUniformLocation(this.updatePositionProgram, 'u_deltaTime'),
    };
    this.updatePositionVA = makeVertexArray(gl, [[this.quadBuffer, this.updatePositionPrgLocs.position]]);

    this.positionsTex = null;
    this.nborsTex = null;
  }

  switchMode(gpu) {
    // do nothing if we're already in the desired mode
    if (this.gpu == gpu) return;
    // do nothing if there are no particles
    if (this.positions.length == 0) return;

    this.gpu = gpu;

    // switching from CPU to GPU
    // need to re-initialize all buffers
    if (gpu) this.initTextures(true);
    else {
      // swittching from GPU to CPU
      // need to download velocities from frame buffer
      const velocity = this.readFrameBuffer(this.updateVelocityFB);
      // copy read pixels to velocities array
      for (let i = 0; i < this.velocities.length; ++i) this.velocities[i] = velocity[i];
    }
  }

  readFrameBuffer(fb) {
    let gl = this.gl;

    // dimensions of destination texture
    let width = this.positionsTexDimensions[0];
    let height = this.positionsTexDimensions[1];

    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, width, height);
    let results = new Float32Array(width * height * 2);
    gl.readPixels(0, 0, width, height, gl.RG, gl.FLOAT, results);

    // unbind frame buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return results;
  }

  emitParticles(isInsideShape, args) {
    let numParticles = this.positions.length;

    if (this.gpu && numParticles > 0) {
      // need to download velocities from frame buffer
      const velocity = this.readFrameBuffer(this.updateVelocityFB);
      // copy read pixels to velocities array
      for (let i = 0; i < this.velocities.length; ++i) this.velocities[i] = velocity[i];
    }

    let s = Math.sin(-this.orient);
    let c = Math.cos(-this.orient);

    // loop over all simulation domain (grid)
    for (let i = 0; i < this.numGridCells; ++i) {
      let x = (i + 0.5) * this.cellSize + this.origin;
      for (let j = 0; j < this.numGridCells; ++j) {
        let y = (j + 0.5) * this.cellSize + this.origin;

        // test whether we're inside the shape using the passed function
        if (isInsideShape(x, y, args)) {
          // rotate coords based on sandbox orientation
          let rot_p = [c * x - s * y, s * x + c * y];
          // clip emission to boundary
          if (Math.abs(rot_p[0]) < this.boundary[0] && Math.abs(rot_p[1]) < this.boundary[1]) {
            this.positions.push(x, y);
            this.velocities.push(0, 0);
          }
        }
      }
    }
    // if we have injected new particles, recreate all textures
    if (this.gpu && this.positions.length != numParticles) this.initTextures(true);
    return this.positions;
  }

  findNeighbors() {

    let radius = this.cellSize * 1.75;

    let numParticles = this.positions.length / 2;
    let width = Math.abs(this.origin);// reminder: origin is negative

    // splat all particle poisitions into a coarser grid for faster look-up        
    // grid is a Hash Map for speed and sparsity        
    let grid = new Map();
    let numCells = Math.floor(this.numGridCells / 2.0); // ~4 particles per cell in 2D
    for (let i = 0; i < numParticles; ++i) {

      // splat coordinates
      let x = Math.floor(numCells * (0.5 + 0.5 * (this.positions[2 * i] / width)));
      let y = Math.floor(numCells * (0.5 + 0.5 * (this.positions[2 * i + 1] / width)));

      let key = y * numCells + x;
      if (grid.has(key)) {
        let val = grid.get(key);
        val.push(i);
        grid.set(key, val);
      }
      else grid.set(key, [i]);
    }

    let nbors = new Map();
    let sqRadius = radius * radius;
    for (let i = 0; i < numParticles; ++i) {
      let x = Math.floor(numCells * (0.5 + 0.5 * (this.positions[2 * i] / width)));
      let y = Math.floor(numCells * (0.5 + 0.5 * (this.positions[2 * i + 1] / width)));

      // look up cell and 8 adjacent cells
      // cells order plays a role
      // as collisions will be resolved in the order of neighbor insertion
      let keys = [y * numCells + x,
      (y + 1) * numCells + x, (y - 1) * numCells + x,
      y * numCells + x - 1, y * numCells + x + 1,
      (y + 1) * numCells + x - 1, (y + 1) * numCells + x + 1,
      (y - 1) * numCells + x - 1, (y - 1) * numCells + x + 1,
      ];

      let nbor = [];
      let x1 = this.positions[2 * i];
      let y1 = this.positions[2 * i + 1];

      for (const key of keys) {
        if (grid.has(key)) {
          // loop over candidate neighbors and include those below a radius threshold
          let candidates = grid.get(key);
          for (const n of candidates) {
            if (i == n) continue;  // skip self
            let xx = this.positions[2 * n] - x1;
            let yy = this.positions[2 * n + 1] - y1;
            let d = xx * xx + yy * yy;
            if (d < sqRadius) nbor.push(n);
          }
        }
      }
      // copy (possibly empty) list of neighbors of particle i into final hash map
      nbors.set(i, nbor);
    }

    return nbors;
  }

  // create a texture for storing neihboring indices for each particle
  createNeighborTexture(nbors, maxNbors) {
    let gl = this.gl;

    // turn neighbors map into a 1d array
    // each particle is represented by a slice of 'maxNbors' indices.
    // where an index of -1 means no neighbor     
    // 'maxNbors' is hard-coded to 24
    let numParticles = this.positions.length / 2;
    let nbors1D = [];
    nbors1D.length = numParticles * maxNbors;

    // iterate over all particles (stored in map in correct order)    
    for (let [i, nborsOneParticle] of nbors.entries()) {
      let idx = i * maxNbors; // index of slice      
      for (let n = 0; n < nborsOneParticle.length && n < maxNbors; ++n) {
        nbors1D[idx] = nborsOneParticle[n];
        idx += 1;
      }
      // add final delimiter if needed
      if (idx < (i + 1) * maxNbors) nbors1D[idx] = -1;
    }

    // create neighbors texture
    if (this.nborsTex) gl.deleteTexture(this.nborsTex);
    let { tex: nborsTex, dimensions: texDimensions } =
      createIntDataTexture(gl, nbors1D, 1, gl.R32I, gl.RED_INTEGER, gl.INT);
    this.nborsTex = nborsTex;
  }

  deleteTextures() {
    // if no texture has been initialized, return    
    if (this.positionsTex == null) return;

    let gl = this.gl;
    gl.deleteFramebuffer(this.updatePosition1FB);    
    gl.deleteFramebuffer(this.updatePosition0FB);
    gl.deleteFramebuffer(this.updateVelocityFB);
    gl.deleteFramebuffer(this.estimatePositionFB);
    gl.deleteFramebuffer(this.constrainToBoundaryFB);
    gl.deleteFramebuffer(this.checkCollisionFB);
    gl.deleteFramebuffer(this.constrainParticlesFB);

    gl.deleteTexture(this.updateVelocityTex);
    gl.deleteTexture(this.constrainParticlesTex);
    gl.deleteTexture(this.checkCollisionTex);
    gl.deleteTexture(this.constrainBoundaryTex);
    gl.deleteTexture(this.velocitiesTex);
    gl.deleteTexture(this.positions1Tex);
    gl.deleteTexture(this.positions0Tex);
  }

  initTextures() {
    let gl = this.gl;
    this.deleteTextures();

    // Estimate position program
    let { tex: Tex0, dimensions: texDimensions } =
      createDataTexture(gl, this.positions, 2, gl.RG32F, gl.RG, gl.FLOAT);
    let { tex: Tex1, dimensions: dummy1 } =
      createDataTexture(gl, this.positions, 2, gl.RG32F, gl.RG, gl.FLOAT);

    // we need to create two textures to avoid a feedback loop
    // we'll cycle between these two as needed
    this.positions0Tex = Tex0;
    this.positions1Tex = Tex1;
    this.positionsTex = this.positions0Tex; // start with texture 0
    this.positionsTexDimensions = texDimensions;

    // updatePosition is the frame buffer where we write final positions
    // this creates a cycle for all the frame buffers, yeah!
    this.updatePosition1FB = createFramebuffer(gl, this.positions0Tex);
    this.updatePosition0FB = createFramebuffer(gl, this.positions1Tex);
    this.updatePositionFB = this.updatePosition0FB;

    let { tex: velocitiesTex, dimensions: velocitiesTexDimensions } =
      createDataTexture(gl, this.velocities, 2, gl.RG32F, gl.RG, gl.FLOAT);
    this.velocitiesTex = velocitiesTex;

    // updateVelocity is the frame buffer where we write final velocities
    this.updateVelocityFB = createFramebuffer(gl, this.velocitiesTex);

    // Boundary constrain program
    let { tex: Tex2, dimensions: dummy2 } =
      createDataTexture(gl, this.positions, 2, gl.RG32F, gl.RG, gl.FLOAT);
    this.constrainBoundaryTex = Tex2;
    // estimatePosition is the frame buffer to write to the contraintBoundary Position Texture
    this.estimatePositionFB = createFramebuffer(gl, this.constrainBoundaryTex);

    // check collisions program
    let { tex: Tex3a, dimensions: dummy3a } =
      createDataTexture(gl, this.positions, 2, gl.RG32F, gl.RG, gl.FLOAT);
    this.checkCollisionTex = Tex3a;
    // constrainToBoundary is the frame buffer to write into the check Collision Texture
    this.constrainToBoundaryFB = createFramebuffer(gl, this.checkCollisionTex);

    // Particles constrain program
    let { tex: Tex3, dimensions: dummy3 } =
      createDataTexture(gl, this.positions, 2, gl.RG32F, gl.RG, gl.FLOAT);
    this.constrainParticlesTex = Tex3;
    // checkCollision is the frame buffer to write into the contraintParticles Position Texture
    this.checkCollisionFB = createFramebuffer(gl, this.constrainParticlesTex);

    // Update Velocity program
    let { tex: Tex4, dimensions: dummy4 } =
      createDataTexture(gl, this.positions, 2, gl.RG32F, gl.RG, gl.FLOAT);
    this.updateVelocityTex = Tex4;
    // constrainParticles is the frame buffer to write into the update velocity Texture
    this.constrainParticlesFB = createFramebuffer(gl, this.updateVelocityTex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  drawSingleQuad(fb) {
    let gl = this.gl;
    // dimensions of destination texture
    let width = this.positionsTexDimensions[0];
    let height = this.positionsTexDimensions[1];

    // bind to proper frame buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, width, height);

    // drawing a clip space -1 to +1 quad = map over entire destination array
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  drawAndReadBackSingleQuad(fb) {
    let gl = this.gl;

    // dimensions of destination texture
    let width = this.positionsTexDimensions[0];
    let height = this.positionsTexDimensions[1];

    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, width, height);

    // drawing a clip space -1 to +1 quad = map over entire destination array
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const results = new Float32Array(width * height * 2);
    gl.readPixels(0, 0, width, height, gl.RG, gl.FLOAT, results);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return results;
  }

  estimatePositionGPU(substep, gravityForce) {
    let gl = this.gl;

    gl.bindVertexArray(this.estimatePositionVA);// just a quad    
    gl.useProgram(this.estimatePositionPrg);

    // bind texture to texture units 0 and 1
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.positionsTex);
    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocitiesTex);

    // tell the shader to look at the textures on texture units 0 and 1
    gl.uniform1i(this.estimatePositionPrgLocs.positionTex, 0);
    gl.uniform1i(this.estimatePositionPrgLocs.velocityTex, 1);

    // set other uniforms  
    gl.uniform2f(this.estimatePositionPrgLocs.gravityForce, 0, gravityForce);
    gl.uniform1f(this.estimatePositionPrgLocs.deltaTime, substep);

    this.drawSingleQuad(this.estimatePositionFB);
  }

  solveBoundaryConstraintsGPU(friction) {
    //console.log(friction);
    let gl = this.gl;

    gl.useProgram(this.constrainToBoundaryProgram);
    gl.bindVertexArray(this.constrainToBoundaryVA);// just a quad        

    // bind texture to texture units 0 and 1
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.constrainBoundaryTex);
    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, this.positionsTex);

    // tell the shader to look at the textures on texture units 0
    gl.uniform1i(this.constrainToBoundaryPrgLocs.newPositionTex, 0);
    gl.uniform1i(this.constrainToBoundaryPrgLocs.positionTex, 1);

    // set other uniforms  
    gl.uniform1f(this.constrainToBoundaryPrgLocs.boundaryDist, this.boundary[0]);
    gl.uniform1f(this.constrainToBoundaryPrgLocs.friction, friction);
    gl.uniform1f(this.constrainToBoundaryPrgLocs.orient, this.orient);

    this.drawSingleQuad(this.constrainToBoundaryFB);
  }

  checkParticleCollisionsGPU() {
    let gl = this.gl;

    gl.useProgram(this.checkCollisionProgram);
    gl.bindVertexArray(this.checkCollisionVA);// just a quad        

    // bind texture to texture units 0 and 1
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.checkCollisionTex);
    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, this.nborsTex);

    // tell the shader to look at the textures on texture units 0 & 1
    gl.uniform1i(this.checkCollisionPrgLocs.newPositionTex, 0);
    gl.uniform1i(this.checkCollisionPrgLocs.nborsTex, 1);

    // set other uniforms      
    gl.uniform1f(this.checkCollisionPrgLocs.radius, this.cellSize * 0.5);

    this.drawSingleQuad(this.checkCollisionFB);
  }

  solveParticleConstraintsGPU(friction, lastIter) {
    let gl = this.gl;

    gl.useProgram(this.constrainParticlesProgram);
    gl.bindVertexArray(this.constrainParticlesVA);// just a quad        

    // bind texture to texture units 0 and 1
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.constrainParticlesTex);
    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, this.checkCollisionTex);
    gl.activeTexture(gl.TEXTURE0 + 2);
    gl.bindTexture(gl.TEXTURE_2D, this.positionsTex);
    gl.activeTexture(gl.TEXTURE0 + 3);
    gl.bindTexture(gl.TEXTURE_2D, this.nborsTex);

    // tell the shader to look at the textures on texture units 0-3
    gl.uniform1i(this.constrainParticlesPrgLocs.latestPositionTex, 0);
    gl.uniform1i(this.constrainParticlesPrgLocs.newPositionTex, 1);
    gl.uniform1i(this.constrainParticlesPrgLocs.positionTex, 2);
    gl.uniform1i(this.constrainParticlesPrgLocs.nborsTex, 3);

    // set other uniforms      
    gl.uniform1f(this.constrainParticlesPrgLocs.radius, this.cellSize * 0.5);
    gl.uniform1f(this.constrainParticlesPrgLocs.friction, friction);

    if (lastIter) return this.drawAndReadBackSingleQuad(this.constrainParticlesFB);
    else this.drawSingleQuad(this.estimatePositionFB);
  }

  advanceFrameGPU(nbors, nstep, substep, gravityForce, frictionPerStep, boundaryFrictionPerStep) {
    
    this.createNeighborTexture(nbors, this.maxNbors);

    //this.initTextures(false);

    for (let step = 0; step < nstep; step++) {
      this.estimatePositionGPU(substep, gravityForce);

      // iteratively constrain estimated positions  
      for (let iter = 0; iter < this.numConstraintIteration; ++iter) {

        this.solveBoundaryConstraintsGPU(boundaryFrictionPerStep);

        this.checkParticleCollisionsGPU();
        const lastIter = (iter == this.numConstraintIteration - 1);
        this.solveParticleConstraintsGPU(frictionPerStep, lastIter);
      }

      // true up velocities based on previous and new position
      this.updateVelocityGPU(substep, nstep);
      if (step == nstep - 1) {
        const results = this.updatePositionGPU(substep, true);
        for (let i = 0; i < this.positions.length; ++i) this.positions[i] = results[i];
      }
      else this.updatePositionGPU(substep, false);

      // swap buffers for next iteration
      if (this.positionsTex == this.positions0Tex) {
        this.updatePositionFB = this.updatePosition1FB;
        this.positionsTex = this.positions1Tex;
      }
      else {
        this.updatePositionFB = this.updatePosition0FB;
        this.positionsTex = this.positions0Tex;
      }
    }
  }


  advanceFrame(frameDuration, nstep) {
    let substep = frameDuration / nstep;
    let gravityForce = -this.gravity * substep;
    let numParticles = this.positions.length / 2;
    if (numParticles == 0) return;

    // friction must be adjusted based on number of iterations
    let frictionPerStep = Math.pow(1 - this.friction, 1 / this.numConstraintIteration);
    let boundaryFrictionPerStep = Math.pow(1 - this.boundaryFriction, 1 / this.numConstraintIteration);

    // find list of neighbor
    let nbors = this.findNeighbors();

    // are we solving everything on the GPU?
    if (this.gpu) {
      this.advanceFrameGPU(nbors, nstep, substep, gravityForce, frictionPerStep, boundaryFrictionPerStep);
      return;
    }

    let new_p = this.positions.splice(); // deep copy
    for (let step = 0; step < nstep; step++) {

      // estimate positions by end of time step
      for (let i = 0; i < numParticles; ++i) {
        // new estimated velocities by integrating forces over substep
        this.velocities[i * 2 + 1] += gravityForce;

        // new estimated positions by using estimated velocities at the end of the time step                
        new_p[i * 2] = this.positions[i * 2] + this.velocities[i * 2] * substep;       // x coord
        new_p[i * 2 + 1] = this.positions[i * 2 + 1] + this.velocities[i * 2 + 1] * substep; // y coord        
      }

      // iteratively constrain estimated positions      
      for (let iter = 0; iter < this.numConstraintIteration; ++iter) {

        this.solveBoundaryConstraints(new_p, boundaryFrictionPerStep);
        this.solveParticleConstraints(new_p, nbors, frictionPerStep);
      }

      // true up velocities based on previous and new position
      for (let i = 0; i < numParticles; ++i) {

        this.velocities[i * 2] = (new_p[i * 2] - this.positions[i * 2]) / substep;
        this.velocities[i * 2 + 1] = (new_p[i * 2 + 1] - this.positions[i * 2 + 1]) / substep;
        let speed = m3.distance(0, 0, this.velocities[i * 2] * nstep, this.velocities[i * 2 + 1] * nstep);

        // clamp velocity
        if (speed > this.maxSpeed) {
          let s = this.maxSpeed / speed;
          this.velocities[i * 2] *= s;
          this.velocities[i * 2 + 1] *= s;
          this.positions[i * 2] += this.velocities[i * 2] * substep;
          this.positions[i * 2 + 1] += this.velocities[i * 2 + 1] * substep;
        }
        else {
          this.positions[i * 2] = new_p[i * 2];
          this.positions[i * 2 + 1] = new_p[i * 2 + 1];
        }
      }
    }
  }

  updateVelocityGPU(substep, nstep) {
    let gl = this.gl;

    gl.useProgram(this.updateVelocityProgram);
    gl.bindVertexArray(this.updateVelocityVA);// just a quad        

    // bind texture to texture units 0 and 1
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.updateVelocityTex);
    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, this.positionsTex);

    // tell the shader to look at the textures on texture units 0 and 1
    gl.uniform1i(this.updateVelocityPrgLocs.newPositionTex, 0);
    gl.uniform1i(this.updateVelocityPrgLocs.positionTex, 1);

    // set other uniforms  
    gl.uniform1f(this.updateVelocityPrgLocs.deltaTime, substep);
    gl.uniform1f(this.updateVelocityPrgLocs.step, nstep);
    gl.uniform1f(this.updateVelocityPrgLocs.maxSpeed, this.maxSpeed);

    this.drawSingleQuad(this.updateVelocityFB);
  }

  updatePositionGPU(substep, readResults) {
    let gl = this.gl;

    gl.useProgram(this.updatePositionProgram);
    gl.bindVertexArray(this.updatePositionVA);// just a quad        

    // bind texture to texture units 0 and 1
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.positionsTex);
    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocitiesTex);

    // tell the shader to look at the textures on texture units 0 and 1
    gl.uniform1i(this.updatePositionPrgLocs.positionTex, 0);
    gl.uniform1i(this.updatePositionPrgLocs.velocityTex, 1);
    // set other uniforms  
    gl.uniform1f(this.updatePositionPrgLocs.deltaTime, substep);

    if (readResults) {
      return this.drawAndReadBackSingleQuad(this.updatePositionFB);
    }
    else this.drawSingleQuad(this.updatePositionFB);
  }

  solveParticleConstraints(new_p, nbors, friction) {

    let numParticles = this.positions.length / 2;

    // record collisions with other particles (as indices)
    let collision = new Map();

    // loop over each particle and test collision with other particles    
    for (let i = 0; i < numParticles; ++i) {

      // inter particles collisions
      // loop over neighbors        
      let nbor = nbors.get(i);
      for (const n of nbor) {

        // use symmetry for speed and stability
        if (i <= n) continue;

        let dist = m3.distance(new_p[2 * i], new_p[2 * i + 1], new_p[2 * n], new_p[2 * n + 1]) - this.cellSize;
        if (dist < 0) {

          // register collision
          if (collision.has(i)) {
            let val = collision.get(i);
            val.push(n);
            collision.set(i, val);
          }
          else collision.set(i, [n]);
          // register collision both ways
          if (collision.has(n)) {
            let val = collision.get(n);
            val.push(i);
            collision.set(n, val);
          }
          else collision.set(n, [i]);

          let dir = [new_p[2 * i] - new_p[2 * n], new_p[2 * i + 1] - new_p[2 * n + 1]];
          let strength = -0.25 * dist; // -0.25 = 0.5 (constraint weight) * 0.5 (half on each particle) * -1 (dist<0)
          dir = m3.normalize(dir[0], dir[1]);

          // apply equal and opposite position corrections to pair of colliding particles
          new_p[2 * i] += strength * dir[0];
          new_p[2 * i + 1] += strength * dir[1];

          new_p[2 * n] -= strength * dir[0];
          new_p[2 * n + 1] -= strength * dir[1];
        }
      }
    }

    // loop over each colliding particle and add friction in the tangential direction
    for (let i = 0; i < numParticles; ++i) {
      if (collision.has(i) == false) continue;

      let colliders = collision.get(i);
      for (let c of colliders) {

        let N = m3.normalize(new_p[2 * i] - new_p[2 * c], new_p[2 * i + 1] - new_p[2 * c + 1]);
        let delta = [new_p[2 * i] - this.positions[2 * i], new_p[2 * i + 1] - this.positions[2 * i + 1]];
        let dot = m3.dot(delta[0], delta[1], N[0], N[1]);
        let normalDelta = [dot * N[0], dot * N[1]];
        let tangentialDelta = [delta[0] - normalDelta[0], delta[1] - normalDelta[1]];

        new_p[2 * i] = this.positions[2 * i] + normalDelta[0] + friction * tangentialDelta[0];
        new_p[2 * i + 1] = this.positions[2 * i + 1] + normalDelta[1] + friction * tangentialDelta[1];
      }
    }
    return new_p;
  }

  solveBoundaryConstraints(new_p, friction) {

    let numParticles = this.positions.length / 2;
    let s = Math.sin(-this.orient);
    let c = Math.cos(-this.orient);

    // loop over each particle and test collision with boundary
    for (let i = 0; i < numParticles; ++i) {

      // record collision with boundary
      let boundaryCollision = false;
      let dist;
      // rotate coords based on sandbox orientation
      let x = new_p[2 * i];
      let y = new_p[2 * i + 1];
      let rot_p = [c * x - s * y, s * x + c * y];
      let d = [0, 0];

      // collision with box, solve along each axis independently
      for (let axis = 0; axis < 2; axis++) {
        dist = Math.abs(rot_p[axis]) - this.boundary[axis];
        if (dist < 0) continue;
        if (rot_p[axis] > 0) dist = -dist;

        d[axis] = 0.5 * dist;
        boundaryCollision = true;
      }

      // add corrective displacement with friction in the tangential direction
      if (boundaryCollision) {

        // rotate back to world
        new_p[2 * i] += c * d[0] + s * d[1];
        new_p[2 * i + 1] += -s * d[0] + c * d[1];

        let N = m3.normalize(new_p[2 * i], new_p[2 * i + 1]);
        let delta = [new_p[2 * i] - this.positions[2 * i], new_p[2 * i + 1] - this.positions[2 * i + 1]];
        let dot = m3.dot(delta[0], delta[1], N[0], N[1]);
        let normalDelta = [dot * N[0], dot * N[1]];
        let tangentialDelta = [delta[0] - normalDelta[0], delta[1] - normalDelta[1]];

        new_p[2 * i] = this.positions[2 * i] + normalDelta[0] + friction * tangentialDelta[0];
        new_p[2 * i + 1] = this.positions[2 * i + 1] + normalDelta[1] + friction * tangentialDelta[1];
      }
    }
    return new_p;
  }
}

export { PBDSolverGPU };