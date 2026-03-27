'use client';

import { useEffect, useRef } from 'react';

export default function HeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Particle system
    interface Particle {
      x: number; y: number; size: number; speedX: number; speedY: number;
      opacity: number; opacityDir: number; hue: number;
    }

    const particles: Particle[] = [];
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 3 + 1,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: -Math.random() * 0.5 - 0.1,
        opacity: Math.random() * 0.5 + 0.1,
        opacityDir: Math.random() > 0.5 ? 0.003 : -0.003,
        hue: Math.random() * 40 + 100, // green range
      });
    }

    // Floating orbs
    interface Orb {
      x: number; y: number; radius: number; speedX: number; speedY: number;
      color: string; opacity: number;
    }

    const orbs: Orb[] = [
      { x: canvas.width * 0.2, y: canvas.height * 0.3, radius: 150, speedX: 0.15, speedY: 0.08, color: '102, 187, 106', opacity: 0.07 },
      { x: canvas.width * 0.8, y: canvas.height * 0.6, radius: 200, speedX: -0.12, speedY: -0.06, color: '165, 214, 167', opacity: 0.05 },
      { x: canvas.width * 0.5, y: canvas.height * 0.2, radius: 120, speedX: 0.08, speedY: 0.12, color: '200, 230, 201', opacity: 0.06 },
      { x: canvas.width * 0.3, y: canvas.height * 0.7, radius: 180, speedX: -0.1, speedY: 0.05, color: '129, 199, 132', opacity: 0.04 },
      { x: canvas.width * 0.7, y: canvas.height * 0.4, radius: 100, speedX: 0.18, speedY: -0.1, color: '76, 175, 80', opacity: 0.06 },
    ];

    // Leaf shapes
    interface Leaf {
      x: number; y: number; size: number; rotation: number; rotSpeed: number;
      speedX: number; speedY: number; opacity: number;
    }

    const leaves: Leaf[] = [];
    for (let i = 0; i < 8; i++) {
      leaves.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 15 + 8,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.01,
        speedX: (Math.random() - 0.5) * 0.2,
        speedY: -Math.random() * 0.15 - 0.05,
        opacity: Math.random() * 0.12 + 0.03,
      });
    }

    const drawLeaf = (x: number, y: number, size: number, rotation: number, opacity: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.bezierCurveTo(size * 0.8, -size * 0.5, size * 0.6, size * 0.5, 0, size);
      ctx.bezierCurveTo(-size * 0.6, size * 0.5, -size * 0.8, -size * 0.5, 0, -size);
      ctx.fillStyle = `rgba(165, 214, 167, ${opacity})`;
      ctx.fill();
      ctx.restore();
    };

    const animate = () => {
      time += 0.005;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw aurora waves
      for (let w = 0; w < 3; w++) {
        ctx.beginPath();
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        const alpha = 0.03 + w * 0.01;
        gradient.addColorStop(0, `rgba(46, 125, 50, ${alpha})`);
        gradient.addColorStop(0.5, `rgba(102, 187, 106, ${alpha + 0.02})`);
        gradient.addColorStop(1, `rgba(27, 94, 32, ${alpha})`);
        ctx.fillStyle = gradient;

        const yOffset = canvas.height * (0.3 + w * 0.15);
        const amplitude = 40 + w * 20;
        const frequency = 0.002 - w * 0.0003;

        ctx.moveTo(0, canvas.height);
        for (let x = 0; x <= canvas.width; x += 4) {
          const y = yOffset + Math.sin(x * frequency + time * (1.5 - w * 0.3)) * amplitude
            + Math.sin(x * frequency * 2.5 + time * 0.8) * (amplitude * 0.3);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(canvas.width, canvas.height);
        ctx.closePath();
        ctx.fill();
      }

      // Draw orbs
      for (const orb of orbs) {
        orb.x += orb.speedX;
        orb.y += orb.speedY;

        if (orb.x < -orb.radius) orb.x = canvas.width + orb.radius;
        if (orb.x > canvas.width + orb.radius) orb.x = -orb.radius;
        if (orb.y < -orb.radius) orb.y = canvas.height + orb.radius;
        if (orb.y > canvas.height + orb.radius) orb.y = -orb.radius;

        const pulseOpacity = orb.opacity + Math.sin(time * 2 + orb.radius) * 0.015;
        const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius);
        grad.addColorStop(0, `rgba(${orb.color}, ${pulseOpacity * 1.5})`);
        grad.addColorStop(0.5, `rgba(${orb.color}, ${pulseOpacity * 0.5})`);
        grad.addColorStop(1, `rgba(${orb.color}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw particles (firefly effect)
      for (const p of particles) {
        p.x += p.speedX;
        p.y += p.speedY;
        p.opacity += p.opacityDir;

        if (p.opacity >= 0.6 || p.opacity <= 0.05) p.opacityDir *= -1;
        if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        grad.addColorStop(0, `rgba(200, 230, 201, ${p.opacity})`);
        grad.addColorStop(0.5, `rgba(165, 214, 167, ${p.opacity * 0.4})`);
        grad.addColorStop(1, 'rgba(165, 214, 167, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity * 0.8})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw floating leaves
      for (const leaf of leaves) {
        leaf.x += leaf.speedX + Math.sin(time * 3 + leaf.size) * 0.15;
        leaf.y += leaf.speedY;
        leaf.rotation += leaf.rotSpeed;

        if (leaf.y < -30) { leaf.y = canvas.height + 30; leaf.x = Math.random() * canvas.width; }
        if (leaf.x < -30) leaf.x = canvas.width + 30;
        if (leaf.x > canvas.width + 30) leaf.x = -30;

        drawLeaf(leaf.x, leaf.y, leaf.size, leaf.rotation, leaf.opacity);
      }

      // Light beam effect
      const beamX = canvas.width * 0.6 + Math.sin(time * 0.5) * canvas.width * 0.15;
      const beamGrad = ctx.createRadialGradient(beamX, -100, 0, beamX, canvas.height * 0.5, canvas.height * 0.8);
      beamGrad.addColorStop(0, 'rgba(200, 230, 201, 0.04)');
      beamGrad.addColorStop(0.3, 'rgba(165, 214, 167, 0.02)');
      beamGrad.addColorStop(1, 'rgba(165, 214, 167, 0)');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}
