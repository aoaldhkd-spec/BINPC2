import { useEffect, useState } from 'react';

const PARTICLES = ['🎊','🎉','❤️','💕','✨','🎈','💖','🍻','💝','🌟'];

interface Particle {
  id: number;
  emoji: string;
  x: number;   // vw origin
  angle: number; // degrees
  dist: number;  // vw travel distance
  size: number;
  dur: number;
  delay: number;
}

function makeParticles(count = 40): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    emoji: PARTICLES[Math.floor(Math.random() * PARTICLES.length)],
    x: 30 + Math.random() * 40,          // 30-70 vw horizontal start
    angle: -180 + Math.random() * 360,    // full circle burst
    dist: 20 + Math.random() * 35,        // travel distance vw
    size: 1.2 + Math.random() * 1.6,      // rem
    dur: 0.8 + Math.random() * 0.8,       // animation duration s
    delay: Math.random() * 0.4,           // stagger
  }));
}

export function ConfettiOverlay({ show }: { show: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;
    setParticles(makeParticles(44));
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(t);
  }, [show]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[280] overflow-hidden">
      <style>{`
        @keyframes confettiBurst {
          0%   { transform: translate(0,0) rotate(0deg) scale(1);   opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) rotate(var(--rot)) scale(0.3); opacity: 0; }
        }
      `}</style>
      {particles.map(p => {
        const rad = (p.angle * Math.PI) / 180;
        const tx = `${Math.cos(rad) * p.dist}vw`;
        const ty = `${Math.sin(rad) * p.dist}vw`;
        const rot = `${-180 + Math.random() * 360}deg`;
        return (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: `${p.x}vw`,
              top: '50vh',
              fontSize: `${p.size}rem`,
              lineHeight: 1,
              '--tx': tx,
              '--ty': ty,
              '--rot': rot,
              animation: `confettiBurst ${p.dur}s ease-out ${p.delay}s forwards`,
              willChange: 'transform, opacity',
            } as React.CSSProperties}
          >
            {p.emoji}
          </div>
        );
      })}
    </div>
  );
}
