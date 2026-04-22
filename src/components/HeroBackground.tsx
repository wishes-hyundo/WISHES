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

    // L-perf4 (2026-04-22): 일시정지 게이팅.
    //   1) document.hidden — 백그라운드 탭이면 브라우저가 rAF 를 throttle 하지만
    //      명시적으로 cancel 하여 즉시 중단 (CPU/GPU 절약, 모바일 배터리).
    //   2) IntersectionObserver — 히어로가 스크롤로 뷰포트 밖이면 중단.
    //   3) prefers-reduced-motion — OS 접근성 설정 존중(멈춘 상태로 단일 프레임만).
    let paused = false;
    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // L-res2 (2026-04-22): DPR-aware intrinsic resolution + ctx 스케일.
    //   이전: cssW = innerWidth → DPR=2 화면에서 물리 픽셀의 절반 해상도로
    //   렌더돼 오로라/파티클/잎사귀가 블러링. 개선: intrinsic = innerWidth × DPR,
    //   CSS 는 px 고정, ctx 를 DPR 배율로 setTransform 하여 CSS 좌표계로 그린다.
    let cssW = window.innerWidth;
    let cssH = window.innerHeight;
    const resize = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      cssW = window.innerWidth;
      cssH = window.innerHeight;
      const cv = canvas;
      cv.width = Math.round(cssW * dpr);
      cv.height = Math.round(cssH * dpr);
      cv.style.width = `${cssW}px`;
      cv.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
        x: Math.random() * cssW,
        y: Math.random() * cssH,
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
      { x: cssW * 0.2, y: cssH * 0.3, radius: 150, speedX: 0.15, speedY: 0.08, color: '102, 187, 106', opacity: 0.07 },
      { x: cssW * 0.8, y: cssH * 0.6, radius: 200, speedX: -0.12, speedY: -0.06, color: '165, 214, 167', opacity: 0.05 },
      { x: cssW * 0.5, y: cssH * 0.2, radius: 120, speedX: 0.08, speedY: 0.12, color: '200, 230, 201', opacity: 0.06 },
      { x: cssW * 0.3, y: cssH * 0.7, radius: 180, speedX: -0.1, speedY: 0.05, color: '129, 199, 132', opacity: 0.04 },
      { x: cssW * 0.7, y: cssH * 0.4, radius: 100, speedX: 0.18, speedY: -0.1, color: '76, 175, 80', opacity: 0.06 },
    ];

    // Leaf shapes
    interface Leaf {
      x: number; y: number; size: number; rotation: number; rotSpeed: number;
      speedX: number; speedY: number; opacity: number;
    }

    const leaves: Leaf[] = [];
    for (let i = 0; i < 8; i++) {
      leaves.push({
        x: Math.random() * cssW,
        y: Math.random() * cssH,
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
      ctx.clearRect(0, 0, cssW, cssH);

      // Draw aurora waves
      for (let w = 0; w < 3; w++) {
        ctx.beginPath();
        const gradient = ctx.createLinearGradient(0, 0, cssW, 0);
        const alpha = 0.03 + w * 0.01;
        gradient.addColorStop(0, `rgba(46, 125, 50, ${alpha})`);
        gradient.addColorStop(0.5, `rgba(102, 187, 106, ${alpha + 0.02})`);
        gradient.addColorStop(1, `rgba(27, 94, 32, ${alpha})`);
        ctx.fillStyle = gradient;

        const yOffset = cssH * (0.3 + w * 0.15);
        const amplitude = 40 + w * 20;
        const frequency = 0.002 - w * 0.0003;

        ctx.moveTo(0, cssH);
        for (let x = 0; x <= cssW; x += 4) {
          const y = yOffset + Math.sin(x * frequency + time * (1.5 - w * 0.3)) * amplitude
            + Math.sin(x * frequency * 2.5 + time * 0.8) * (amplitude * 0.3);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(cssW, cssH);
        ctx.closePath();
        ctx.fill();
      }

      // Draw orbs
      for (const orb of orbs) {
        orb.x += orb.speedX;
        orb.y += orb.speedY;

        if (orb.x < -orb.radius) orb.x = cssW + orb.radius;
        if (orb.x > cssW + orb.radius) orb.x = -orb.radius;
        if (orb.y < -orb.radius) orb.y = cssH + orb.radius;
        if (orb.y > cssH + orb.radius) orb.y = -orb.radius;

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
        if (p.y < -10) { p.y = cssH + 10; p.x = Math.random() * cssW; }
        if (p.x < -10) p.x = cssW + 10;
        if (p.x > cssW + 10) p.x = -10;

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

        if (leaf.y < -30) { leaf.y = cssH + 30; leaf.x = Math.random() * cssW; }
        if (leaf.x < -30) leaf.x = cssW + 30;
        if (leaf.x > cssW + 30) leaf.x = -30;

        drawLeaf(leaf.x, leaf.y, leaf.size, leaf.rotation, leaf.opacity);
      }

      // Light beam effect
      const beamX = cssW * 0.6 + Math.sin(time * 0.5) * cssW * 0.15;
      const beamGrad = ctx.createRadialGradient(beamX, -100, 0, beamX, cssH * 0.5, cssH * 0.8);
      beamGrad.addColorStop(0, 'rgba(200, 230, 201, 0.04)');
      beamGrad.addColorStop(0.3, 'rgba(165, 214, 167, 0.02)');
      beamGrad.addColorStop(1, 'rgba(165, 214, 167, 0)');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(0, 0, cssW, cssH);

      if (!paused && !reducedMotion) {
        animationId = requestAnimationFrame(animate);
      }
    };

    const start = () => {
      if (paused) return;
      cancelAnimationFrame(animationId);
      animationId = requestAnimationFrame(animate);
    };
    const stop = () => {
      cancelAnimationFrame(animationId);
    };

    // 초기 단일 프레임 — reduced-motion 환경에서도 정지 이미지는 보여준다.
    animate();

    const onVisibility = () => {
      paused = document.hidden;
      if (paused) stop(); else start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // 히어로 캔버스 스크롤아웃 시 rAF 중단.
    const io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
          const e = entries[0];
          if (!e) return;
          paused = !e.isIntersecting || document.hidden;
          if (paused) stop(); else start();
        }, { threshold: 0.01 })
      : null;
    io?.observe(canvas);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      io?.disconnect();
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
