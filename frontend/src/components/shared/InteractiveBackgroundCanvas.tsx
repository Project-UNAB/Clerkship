import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  baseAlpha: number;
}

export default function InteractiveBackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const mouse = {
      x: -1000,
      y: -1000,
      radius: 180,
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    // Color palette for interactive clinical particles
    const colors = [
      'rgba(56, 189, 248, ',   // Sky Blue
      'rgba(59, 130, 246, ',   // Royal Blue
      'rgba(147, 197, 253, ',  // Soft Blue
      'rgba(16, 185, 129, ',   // Emerald Accent
    ];

    const particleCount = Math.min(Math.floor((width * height) / 18000), 65);
    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2.5 + 1.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        baseAlpha: Math.random() * 0.4 + 0.45,
      });
    }

    // Ambient floating light orbs
    let orb1X = width * 0.2;
    let orb1Y = height * 0.3;
    let orb2X = width * 0.8;
    let orb2Y = height * 0.7;
    let orbAngle = 0;

    const maxDist = 150;
    const maxDistSq = maxDist * maxDist;
    const mouseRadiusSq = mouse.radius * mouse.radius;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Draw subtle ambient glowing orbs
      orbAngle += 0.003;
      const o1x = orb1X + Math.sin(orbAngle) * 50;
      const o1y = orb1Y + Math.cos(orbAngle * 0.8) * 35;
      const o2x = orb2X + Math.cos(orbAngle * 0.7) * 55;
      const o2y = orb2Y + Math.sin(orbAngle * 0.9) * 40;

      const grad1 = ctx.createRadialGradient(o1x, o1y, 10, o1x, o1y, 400);
      grad1.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
      grad1.addColorStop(0.5, 'rgba(37, 99, 235, 0.03)');
      grad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad1;
      ctx.beginPath();
      ctx.arc(o1x, o1y, 400, 0, Math.PI * 2);
      ctx.fill();

      const grad2 = ctx.createRadialGradient(o2x, o2y, 10, o2x, o2y, 450);
      grad2.addColorStop(0, 'rgba(37, 99, 235, 0.07)');
      grad2.addColorStop(0.5, 'rgba(16, 185, 129, 0.02)');
      grad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.arc(o2x, o2y, 450, 0, Math.PI * 2);
      ctx.fill();

      // 2. Update and draw particles & interactive lines
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        // Mouse attraction / interaction
        const dxMouse = mouse.x - p.x;
        const dyMouse = mouse.y - p.y;
        const distSqMouse = dxMouse * dxMouse + dyMouse * dyMouse;

        if (distSqMouse < mouseRadiusSq) {
          const distMouse = Math.sqrt(distSqMouse);
          const force = (mouse.radius - distMouse) / mouse.radius;
          p.x -= (dxMouse / distMouse) * force * 1.2;
          p.y -= (dyMouse / distMouse) * force * 1.2;

          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = `${p.color}${(0.6 * force).toFixed(2)})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }

        // Draw particle node
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.baseAlpha})`;
        ctx.fill();

        // Connect nearby particles
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < maxDistSq) {
            const dist = Math.sqrt(distSq);
            const alpha = (1 - dist / maxDist) * 0.32;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(56, 189, 248, ${alpha.toFixed(2)})`;
            ctx.lineWidth = 1.0;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: -1,
      }}
    />
  );
}
