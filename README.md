# PBD-2d-sim-gpu

Position-Based Dynamics 2d simulation on the GPU. 

[Click on this link to play with it!](http://aaubel.online.fr/pbd)
Should work on most Android devices & PCs, not so on Apple devices unfortunately (mac, ipad, etc.)

This is a port of the C++ Position-Based Dynamics (PBD) 2d engine I wrote a little while ago to Javascript/WebGL2. While the C++ version was multi-threaded, this one can run on the GPU for practically all steps (except neighborhood search).

![Quick demo](https://media.giphy.com/media/UkyPhN6lSwJjNIPhfV/giphy.gif)![Another quick demo](https://media.giphy.com/media/WnRcLGYGB2TKOzxWz2/giphy.gif)

While the hybrid Material Point Method (MPM) is gaining popularity for simulating particulate effects such as snow or sand in the Computer Graphics community, PBD remains an amazingly fast simulation tool that offers a simple trade off between precision and speed by controlling the number of constraint iterations.

An excellent introduction to PBD is available in this paper: http://mmacklin.com/EG2015PBD.pdf.

I have used extensively [Houdini's implementation of PBD](https://www.sidefx.com/docs/houdini/grains/about.html) on the movie How to Train your Dragon: the Hidden World. See [some sand examples here](https://vimeo.com/156511737#t=35s). Here is another example from the movie Abominable where I animated [an avalanche](https://vimeo.com/156511737#t=94s) using 120 million simulated particles.

Having fun with the washing machine:

![Washer](https://media.giphy.com/media/N9l1VG8Yl08TzS8tuu/giphy.gif)
