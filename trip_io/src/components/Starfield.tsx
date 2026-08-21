import { useEffect, useRef } from 'react'

/**
 * Slow drifting particle field behind the hero.
 *
 * Canvas rather than DOM nodes: a few hundred animated elements would cost far
 * more in layout than they are worth. Honours prefers-reduced-motion by
 * painting a single static frame instead of animating.
 */
export function Starfield({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let width = 0
    let height = 0

    type Particle = { x: number; y: number; r: number; a: number; vx: number; vy: number }
    let particles: Particle[] = []

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = width * dpr
      canvas.height = height * dpr
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Density scaled to area so a phone does not get the desktop count.
      const count = Math.round((width * height) / 9000)
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.4 + 0.3,
        a: Math.random() * 0.5 + 0.15,
        vx: (Math.random() - 0.5) * 0.06,
        vy: (Math.random() - 0.5) * 0.06,
      }))
    }

    const draw = () => {
      context.clearRect(0, 0, width, height)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = width
        if (p.x > width) p.x = 0
        if (p.y < 0) p.y = height
        if (p.y > height) p.y = 0

        context.beginPath()
        context.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        context.fillStyle = `rgba(186, 230, 253, ${p.a})`
        context.fill()
      }
      frame = requestAnimationFrame(draw)
    }

    build()
    if (reduceMotion) {
      // One frame, then stop: the texture without the movement.
      context.clearRect(0, 0, width, height)
      for (const p of particles) {
        context.beginPath()
        context.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        context.fillStyle = `rgba(186, 230, 253, ${p.a})`
        context.fill()
      }
    } else {
      frame = requestAnimationFrame(draw)
    }

    const onResize = () => {
      build()
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
