import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { NEBULA_VERTEX, NEBULA_FRAGMENT } from '../three/shaders';
import { STAR_COUNT, NEBULA_RADIUS, getChargeStrength, getLinkDistance, CENTER_GRAVITY } from '../three/constants';

/**
 * Хук инициализации 3D-сцены: bloom, nebula, starfield, camera, physics, animation loop.
 */
export const useSceneSetup = (fgRef, graphData, dims, initDoneRef) => {
  const nebulaTimeRef = useRef({ value: 0 });
  const animFrameRef = useRef(null);

  // Cleanup animation on unmount
  useEffect(() => () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  useEffect(() => {
    if (!fgRef.current || graphData.nodes.length === 0 || initDoneRef.current) return;
    initDoneRef.current = true;
    const fg = fgRef.current;
    const scene = fg.scene();

    // Bloom (subtler — stars have their own emissive now)
    try {
      fg.postProcessingComposer().addPass(
        new UnrealBloomPass(new THREE.Vector2(dims.w, dims.h), 0.6, 0.4, 0.4)
      );
    } catch { /* fallback */ }

    // Nebula
    const nebulaMat = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERTEX, fragmentShader: NEBULA_FRAGMENT,
      uniforms: { uTime: nebulaTimeRef.current },
      side: THREE.BackSide, depthWrite: false,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(NEBULA_RADIUS, 32, 32), nebulaMat));

    // Starfield
    const pos = new Float32Array(STAR_COUNT * 3);
    const col = new Float32Array(STAR_COUNT * 3);
    const spread = NEBULA_RADIUS * 2;
    for (let i = 0; i < STAR_COUNT; i++) {
      pos[i*3]=(Math.random()-0.5)*spread; pos[i*3+1]=(Math.random()-0.5)*spread; pos[i*3+2]=(Math.random()-0.5)*spread;
      const t = Math.random();
      if (t < 0.3) { col[i*3]=0.9+Math.random()*0.1; col[i*3+1]=0.75+Math.random()*0.15; col[i*3+2]=0.5+Math.random()*0.1; }
      else if (t < 0.6) { const w=0.85+Math.random()*0.15; col[i*3]=w; col[i*3+1]=w; col[i*3+2]=w; }
      else { col[i*3]=0.5+Math.random()*0.2; col[i*3+1]=0.65+Math.random()*0.2; col[i*3+2]=0.9+Math.random()*0.1; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.6, vertexColors: true, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })));

    // Lighting — ambient only (sprites are self-lit)
    scene.add(new THREE.AmbientLight(0x606080, 0.4));

    // Camera: start far, then auto-fit to show ALL nodes
    fg.cameraPosition({ x: 0, y: 40, z: 300 });
    setTimeout(() => fg.zoomToFit(2000, 40), 500);
    const cam = fg.camera(); cam.far = 3000; cam.updateProjectionMatrix();

    // Controls
    const ctrl = fg.controls();
    Object.assign(ctrl, { autoRotate: true, autoRotateSpeed: 0.15, enableDamping: true, dampingFactor: 0.04, minDistance: 10, maxDistance: 800 });

    // Physics (adaptive to node count)
    const nodeCount = graphData.nodes.length;
    try {
      fg.d3Force('charge')?.strength(getChargeStrength(nodeCount));
      fg.d3Force('link')?.distance(getLinkDistance(nodeCount));
    } catch (e) { console.warn('Physics setup:', e.message); }

    // Animation loop (nebula time + due-cards pulsation)
    const animate = () => {
      nebulaTimeRef.current.value += 0.016;
      nebulaMat.uniforms.uTime.value = nebulaTimeRef.current.value;
      const t = Date.now() * 0.003;
      graphData.nodes.forEach(n => {
        if (n._hasDueCards && n.__threeObj) {
          const core = n.__threeObj.children[0];
          if (core?.geometry?.type === 'SphereGeometry') core.scale.setScalar(1 + Math.sin(t + n.val) * 0.15);
        }
      });
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
  }, [graphData, dims]);
};
