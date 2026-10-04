import { Suspense, type CSSProperties } from 'react';
import { Canvas, type CanvasProps } from '@react-three/fiber';

interface ThreeCanvasProps extends Omit<CanvasProps, 'style'> {
  children: React.ReactNode;
  style?: CSSProperties;
  className?: string;
}

export default function ThreeCanvas({ children, style, className, ...props }: ThreeCanvasProps) {
  return (
    <Canvas
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', ...style }}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [0, 0, 5], fov: 45, near: 0.1, far: 1000 }}
      dpr={[1, 2]}
      {...props}
    >
      <Suspense fallback={null}>
        {children}
      </Suspense>
    </Canvas>
  );
}
